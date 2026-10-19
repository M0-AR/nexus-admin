import { ForbiddenException, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { env } from "../config/env.ts";
import { PrismaService } from "./prisma.service.ts";
import { loggerFor } from "../common/logger.ts";

const log = loggerFor("TenantDb");

export interface TenantRef {
  id: string;
  slug: string;
  isolationMode: "SHARED" | "DEDICATED";
  dedicatedDatabaseUrl?: string | null;
  dataRegion: string;
}

export type TenantTx = Prisma.TransactionClient;

/**
 * Pattern #1 (hybrid data isolation) + #2 (geo/compliance routing).
 *
 * Shared tenants run on the main pool inside a transaction that pins
 * `app.tenant_id` with set_config(..., true) — transaction-scoped, so it is
 * safe through connection poolers and cannot leak between requests.
 *
 * Dedicated tenants get their own PrismaClient against their own database
 * (same migrations applied — see the isolation runbook in the README); RLS
 * policies still apply there as defense in depth.
 *
 * Region routing: with ENFORCE_REGION=true a node only serves tenants whose
 * dataRegion matches APP_REGION (deploy one stack per region behind geo-DNS).
 */
@Injectable()
export class TenantDbService implements OnModuleDestroy {
  private readonly dedicatedClients = new Map<string, PrismaClient>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    for (const client of this.dedicatedClients.values()) {
      await client.$disconnect().catch(() => undefined);
    }
    this.dedicatedClients.clear();
  }

  assertRegionAllowed(tenant: TenantRef): void {
    if (!env.ENFORCE_REGION) return;
    if (tenant.isolationMode === "DEDICATED") return;
    if (tenant.dataRegion !== env.APP_REGION) {
      throw new ForbiddenException({
        statusCode: 421,
        error: "RegionMismatch",
        message: `Tenant ${tenant.slug} is pinned to ${tenant.dataRegion}; this deployment serves ${env.APP_REGION}.`,
        code: "REGION_MISMATCH",
      });
    }
  }

  /**
   * Run `fn` inside a transaction where RLS is scoped to `tenant`.
   */
  async run<T>(tenant: TenantRef, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    this.assertRegionAllowed(tenant);
    const client = this.clientFor(tenant);
    return client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}::text, true)`;
      return fn(tx);
    });
  }

  private clientFor(tenant: TenantRef): PrismaClient {
    if (tenant.isolationMode !== "DEDICATED" || !tenant.dedicatedDatabaseUrl) {
      return this.prisma;
    }
    let client = this.dedicatedClients.get(tenant.id);
    if (!client) {
      log.info({ tenantId: tenant.id }, "opening dedicated database pool");
      client = new PrismaClient({
        adapter: new PrismaPg({ connectionString: tenant.dedicatedDatabaseUrl }),
      });
      this.dedicatedClients.set(tenant.id, client);
    }
    return client;
  }
}
