import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentTenant, RequireFeature } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional(),
  action: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Pattern #10: per-tenant audit trail (gated by the audit_log entitlement). */
@Controller("audit")
export class AuditController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @RequireFeature("audit_log")
  @Get()
  async list(
    @CurrentTenant() tenant: RequestTenant,
    @Query(zodPipe(QuerySchema)) query: z.infer<typeof QuerySchema>,
  ) {
    return this.tenantDb.run(tenant, async (tx) => {
      const where = {
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {}),
        ...(query.q
          ? {
              OR: [
                { actorEmail: { contains: query.q, mode: "insensitive" as const } },
                { action: { contains: query.q, mode: "insensitive" as const } },
                { entity: { contains: query.q, mode: "insensitive" as const } },
                { ip: { contains: query.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.auditLog.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          actorEmail: row.actorEmail,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          meta: row.meta,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
    });
  }
}
