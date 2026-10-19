import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

function required(name: "APP_DATABASE_URL" | "DATABASE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — is the vitest global setup configured?`);
  return value;
}

/** Runtime client: app_user, NOBYPASSRLS. Every tenant read/write must set app.tenant_id. */
export function appClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: required("APP_DATABASE_URL") }) });
}

/** Migration/seed client: owner role, bypasses RLS. Assertions only. */
export function ownerClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }) });
}

export const TENANT_SCOPED_TABLES = [
  "orders",
  "products",
  "notifications",
  "audit_logs",
  "usage_records",
  "integration_secrets",
  "feature_overrides",
  "tenant_keys",
] as const;

export async function tenantIdBySlug(owner: PrismaClient, slug: string): Promise<string> {
  const rows = await owner.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM tenants WHERE slug = ${slug}
  `;
  if (!rows[0]) throw new Error(`seed fixture tenant "${slug}" not found`);
  return rows[0].id;
}

/** Count rows visible inside a tenant-scoped transaction (shipped pattern). */
export async function countInTenant(client: PrismaClient, tenantId: string, table: string): Promise<number> {
  assertKnownTable(table);
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    const rows = await tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM ${table}`);
    return rows[0]!.count;
  });
}

export async function countWithoutTenantContext(client: PrismaClient, table: string): Promise<number> {
  assertKnownTable(table);
  const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]!.count;
}

function assertKnownTable(table: string): void {
  if (!(TENANT_SCOPED_TABLES as readonly string[]).includes(table)) {
    throw new Error(`unexpected table in test: ${table}`);
  }
}
