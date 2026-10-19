import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentTenant, CurrentUser } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant, RequestUser } from "../common/request-types.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { UsageService } from "../billing/usage.service.ts";

const ORDER_STATUSES = ["PENDING", "PAID", "REFUNDED", "CANCELLED", "FAILED"] as const;

const ListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["createdAt", "amount", "customer", "number"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

const CreateSchema = z.object({
  customer: z.string().trim().min(2).max(120),
  email: z.email().max(160).optional(),
  product: z.string().trim().min(1).max(120),
  channel: z.enum(["DIRECT", "ORGANIC", "REFERRAL", "SOCIAL", "PARTNER", "EMAIL"]).default("DIRECT"),
  amount: z.number().positive().max(1_000_000),
  status: z.enum(ORDER_STATUSES).default("PENDING"),
});

const StatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

const BulkStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
  status: z.enum(ORDER_STATUSES),
});

interface OrderRow {
  id: string;
  number: string;
  customer: string;
  email: string | null;
  product: string;
  channel: string;
  amount: unknown;
  currency: string;
  status: string;
  createdAt: Date;
}

function view(row: OrderRow) {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    email: row.email,
    product: row.product,
    channel: row.channel,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly usage: UsageService,
  ) {}

  @Get()
  async list(
    @CurrentTenant() tenant: RequestTenant,
    @Query(zodPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ) {
    return this.tenantDb.run(tenant, async (tx) => {
      const where = {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { customer: { contains: query.q, mode: "insensitive" as const } },
                { number: { contains: query.q, mode: "insensitive" as const } },
                { email: { contains: query.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.order.findMany({
          where,
          orderBy: { [query.sort]: query.dir },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.order.count({ where }),
      ]);
      return {
        items: rows.map(view),
        total,
        page: query.page,
        pageSize: query.pageSize,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
    });
  }

  @Post()
  async create(
    @CurrentTenant() tenant: RequestTenant,
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ) {
    const created = await this.tenantDb.run(tenant, async (tx) => {
      const count = await tx.order.count();
      const order = await tx.order.create({
        data: {
          tenantId: tenant.id,
          number: `NC-${1001 + count}`,
          customer: body.customer,
          email: body.email,
          product: body.product,
          channel: body.channel,
          amount: body.amount,
          status: body.status,
        },
      });
      await tx.notification.create({
        data: {
          tenantId: tenant.id,
          type: "PAYMENT",
          title: body.status === "PAID" ? "Payment received" : "New order created",
          body: `${order.number} · ${order.customer} · $${Number(order.amount).toFixed(2)}`,
        },
      });
      return order;
    });
    await this.usage.increment(tenant.id, "orders");
    return view(created);
  }

  @Patch("bulk/status")
  async bulkStatus(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(BulkStatusSchema)) body: z.infer<typeof BulkStatusSchema>,
  ) {
    const result = await this.tenantDb.run(tenant, (tx) =>
      tx.order.updateMany({
        where: { id: { in: body.ids }, tenantId: tenant.id },
        data: { status: body.status },
      }),
    );
    return { updated: result.count };
  }

  @Patch(":id/status")
  async updateStatus(
    @CurrentTenant() tenant: RequestTenant,
    @Param("id") id: string,
    @Body(zodPipe(StatusSchema)) body: z.infer<typeof StatusSchema>,
  ) {
    const updated = await this.tenantDb.run(tenant, (tx) =>
      tx.order.update({ where: { id, tenantId: tenant.id }, data: { status: body.status } }),
    );
    return view(updated);
  }
}
