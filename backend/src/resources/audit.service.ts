import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { loggerFor } from "../common/logger.ts";

const log = loggerFor("Audit");

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: entry.tenantId } });
      if (!tenant) return;
      await this.tenantDb.run(
        {
          id: tenant.id,
          slug: tenant.slug,
          isolationMode: tenant.isolationMode,
          dedicatedDatabaseUrl: tenant.dedicatedDatabaseUrl,
          dataRegion: tenant.dataRegion,
        },
        (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: entry.tenantId,
              actorId: entry.actorId ?? undefined,
              actorEmail: entry.actorEmail ?? undefined,
              action: entry.action,
              entity: entry.entity,
              entityId: entry.entityId,
              meta: entry.meta as object | undefined,
              ip: entry.ip,
              userAgent: entry.userAgent,
            },
          }),
      );
    } catch (err) {
      log.warn({ err, action: entry.action }, "failed to write audit record");
    }
  }
}
