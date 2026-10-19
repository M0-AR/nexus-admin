import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "../config/env.ts";
import { loggerFor } from "../common/logger.ts";

const log = loggerFor("PrismaService");

/**
 * Control-plane database client. Connects with the NOBYPASSRLS `app_user`
 * role. Control-plane tables (tenants/users/tokens) are not RLS-scoped;
 * tenant-scoped tables are only ever read/written through TenantDbService,
 * which sets `app.tenant_id` for the transaction.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: env.APP_DATABASE_URL }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
    log.info("control-plane database connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
