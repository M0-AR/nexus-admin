import { Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentTenant } from "../common/decorators.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly tenantDb: TenantDbService) {}

  @Get()
  async list(@CurrentTenant() tenant: RequestTenant) {
    return this.tenantDb.run(tenant, async (tx) => {
      const [rows, unread] = await Promise.all([
        tx.notification.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
        tx.notification.count({ where: { read: false } }),
      ]);
      return {
        items: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })),
        unread,
      };
    });
  }

  @Patch(":id/read")
  async markRead(@CurrentTenant() tenant: RequestTenant, @Param("id") id: string) {
    await this.tenantDb.run(tenant, (tx) =>
      tx.notification.update({ where: { id, tenantId: tenant.id }, data: { read: true } }),
    );
    return { ok: true };
  }

  @Post("read-all")
  async markAllRead(@CurrentTenant() tenant: RequestTenant) {
    const result = await this.tenantDb.run(tenant, (tx) =>
      tx.notification.updateMany({ where: { read: false }, data: { read: true } }),
    );
    return { ok: true, updated: result.count };
  }
}
