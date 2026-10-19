import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentTenant, Roles } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { PLANS } from "../billing/plans.ts";

const ListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
  sort: z.enum(["createdAt", "name", "price", "stock", "updatedAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9-]+$/, "SKU must be alphanumeric with dashes"),
  price: z.number().min(0).max(1_000_000),
  stock: z.number().int().min(0).max(10_000_000).default(0),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).default("DRAFT"),
});

const UpdateSchema = CreateSchema.partial().omit({ sku: true });

function view(row: { id: string; name: string; sku: string; price: unknown; stock: number; status: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: Number(row.price),
    stock: row.stock,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Controller("products")
export class ProductsController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get()
  async list(
    @CurrentTenant() tenant: RequestTenant,
    @Query(zodPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ) {
    return this.tenantDb.run(tenant, async (tx) => {
      const where = {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" as const } }),
        ...(query.q
          ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { sku: { contains: query.q, mode: "insensitive" as const } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: { [query.sort]: query.dir },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.product.count({ where }),
      ]);
      return { items: rows.map(view), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
    });
  }

  @Roles("OWNER", "ADMIN", "MANAGER")
  @Post()
  async create(@CurrentTenant() tenant: RequestTenant, @Body(zodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>) {
    const limit = PLANS[tenant.plan].limits.products;
    const created = await this.tenantDb.run(tenant, async (tx) => {
      const count = await tx.product.count({ where: { status: { not: "ARCHIVED" } } });
      if (count >= limit) {
        throw new ForbiddenException({
          message: `Your plan allows up to ${limit} products. Upgrade to add more.`,
          code: "PLAN_LIMIT_REACHED",
        });
      }
      return tx.product.create({ data: { tenantId: tenant.id, ...body } });
    });
    return view(created);
  }

  @Roles("OWNER", "ADMIN", "MANAGER")
  @Patch(":id")
  async update(
    @CurrentTenant() tenant: RequestTenant,
    @Param("id") id: string,
    @Body(zodPipe(UpdateSchema)) body: z.infer<typeof UpdateSchema>,
  ) {
    const updated = await this.tenantDb.run(tenant, (tx) =>
      tx.product.update({ where: { id, tenantId: tenant.id }, data: body }),
    );
    return view(updated);
  }

  @Roles("OWNER", "ADMIN", "MANAGER")
  @Delete(":id")
  async archive(@CurrentTenant() tenant: RequestTenant, @Param("id") id: string) {
    const updated = await this.tenantDb.run(tenant, (tx) =>
      tx.product.update({ where: { id, tenantId: tenant.id }, data: { status: "ARCHIVED" } }),
    );
    return view(updated);
  }
}
