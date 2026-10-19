import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { TenantDbService } from "../src/prisma/tenant-db.service.ts";
import {
  TENANT_SCOPED_TABLES,
  appClient,
  countInTenant,
  countWithoutTenantContext,
  ownerClient,
  tenantIdBySlug,
} from "./helpers.ts";

let app: PrismaClient;
let owner: PrismaClient;
let acmeId: string;
let globexId: string;
let acmeOrders: number;
let globexOrders: number;

const tableList = TENANT_SCOPED_TABLES.map((t) => `'${t}'`).join(", ");

beforeAll(async () => {
  app = appClient();
  owner = ownerClient();
  acmeId = await tenantIdBySlug(owner, "acme");
  globexId = await tenantIdBySlug(owner, "globex");
  acmeOrders = await countInTenant(app, acmeId, "orders");
  globexOrders = await countInTenant(app, globexId, "orders");
});

afterAll(async () => {
  await app.$disconnect();
  await owner.$disconnect();
});

describe("runtime role posture", () => {
  it("connects as app_user", async () => {
    const rows = await app.$queryRaw<Array<{ user: string }>>`SELECT current_user AS user`;
    expect(rows[0]!.user).toBe("app_user");
  });

  it("is NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE", async () => {
    const rows = await owner.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>
    >`SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'app_user'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
  });
});

describe("catalog guard", () => {
  it("every tenant-scoped table has RLS enabled + forced + a tenant_isolation policy", async () => {
    const rows = await owner.$queryRawUnsafe<
      Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>
    >(`
      SELECT c.relname,
             c.relrowsecurity,
             c.relforcerowsecurity,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public'
                 AND p.tablename = c.relname
                 AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY(ARRAY[${tableList}]::text[])
    `);

    expect(rows.map((r) => r.relname).sort()).toEqual([...TENANT_SCOPED_TABLES].sort());
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname}: RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname}: RLS forced`).toBe(true);
      expect(row.policies, `${row.relname}: exactly one tenant_isolation policy`).toBe(1);
    }
  });

  it("tenant_isolation filters on app.tenant_id for both USING and WITH CHECK", async () => {
    const policies = await owner.$queryRaw<Array<{ tablename: string; qual: string; with_check: string }>>`
      SELECT tablename, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
    `;
    expect(policies).toHaveLength(TENANT_SCOPED_TABLES.length);
    for (const policy of policies) {
      expect(policy.qual, `${policy.tablename}: USING clause`).toContain("app.tenant_id");
      expect(policy.with_check, `${policy.tablename}: WITH CHECK clause`).toContain("app.tenant_id");
    }
  });
});

describe("RLS behavior", () => {
  it("seed fixtures contain data for both tenants (sanity for the assertions below)", async () => {
    expect(acmeOrders).toBeGreaterThan(0);
    expect(globexOrders).toBeGreaterThan(0);
    const total = await owner.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM orders`;
    expect(total[0]!.count).toBe(acmeOrders + globexOrders);
  });

  it("returns zero rows when no tenant context is set", async () => {
    for (const table of TENANT_SCOPED_TABLES) {
      const count = await countWithoutTenantContext(app, table);
      expect(count, `${table} leaks without context`).toBe(0);
    }
  });

  it("scopes reads to exactly the current tenant", async () => {
    const visible = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
      return tx.$queryRaw<Array<{ tenant: string; count: number }>>`
        SELECT tenant_id::text AS tenant, count(*)::int AS count FROM orders GROUP BY tenant_id
      `;
    });
    expect(visible).toEqual([{ tenant: acmeId, count: acmeOrders }]);
  });

  it("keeps tenants disjoint (acme never sees globex rows)", async () => {
    const crossCount = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
      const rows = await tx.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM orders WHERE tenant_id = ${globexId}::uuid
      `;
      return rows[0]!.count;
    });
    expect(crossCount).toBe(0);
  });

  it("rejects inserting a row for another tenant (WITH CHECK)", async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
        await tx.$executeRaw`
          INSERT INTO orders (id, tenant_id, number, customer, product, amount)
          VALUES (gen_random_uuid(), ${globexId}::uuid, 'RLS-NEG-INSERT', 'Mallory', 'Widget', 1.00)
        `;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("rejects inserting with no tenant context", async () => {
    await expect(
      app.$executeRaw`
        INSERT INTO orders (id, tenant_id, number, customer, product, amount)
        VALUES (gen_random_uuid(), ${acmeId}::uuid, 'RLS-NO-CONTEXT', 'Mallory', 'Widget', 1.00)
      `,
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot update rows belonging to another tenant", async () => {
    const changed = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
      return tx.$executeRaw`
        UPDATE orders SET status = 'CANCELLED'::"OrderStatus" WHERE tenant_id = ${globexId}::uuid
      `;
    });
    expect(changed).toBe(0);
  });

  it("cannot move a row to another tenant (WITH CHECK on UPDATE)", async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
        await tx.$executeRaw`UPDATE orders SET tenant_id = ${globexId}::uuid WHERE tenant_id = ${acmeId}::uuid`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot delete rows belonging to another tenant", async () => {
    const deleted = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
      return tx.$executeRaw`DELETE FROM orders WHERE tenant_id = ${globexId}::uuid`;
    });
    expect(deleted).toBe(0);
  });
});

describe("pool safety", () => {
  it("does not leak tenant context after the transaction commits", async () => {
    const inside = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
      const rows = await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM orders`;
      return rows[0]!.count;
    });
    expect(inside).toBe(acmeOrders);

    const after = await app.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM orders`;
    expect(after[0]!.count).toBe(0);
  });

  it("keeps concurrent transactions isolated from each other", async () => {
    const [asAcme, asGlobex] = await Promise.all([
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${acmeId}, true)`;
        await tx.$queryRaw`SELECT count(*) FROM pg_sleep(0.05)`;
        const rows = await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM orders`;
        return rows[0]!.count;
      }),
      app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${globexId}, true)`;
        await tx.$queryRaw`SELECT count(*) FROM pg_sleep(0.05)`;
        const rows = await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM orders`;
        return rows[0]!.count;
      }),
    ]);
    expect(asAcme).toBe(acmeOrders);
    expect(asGlobex).toBe(globexOrders);
  });
});

describe("TenantDbService.run (shipped access path)", () => {
  it("scopes reads to the requested tenant", async () => {
    const prisma = new PrismaService();
    const tenantDb = new TenantDbService(prisma);
    const acme = { id: acmeId, slug: "acme", isolationMode: "SHARED" as const, dataRegion: "us-east-1" };
    const globex = { id: globexId, slug: "globex", isolationMode: "SHARED" as const, dataRegion: "us-east-1" };

    try {
      await expect(tenantDb.run(acme, (tx) => tx.order.count())).resolves.toBe(acmeOrders);
      await expect(tenantDb.run(globex, (tx) => tx.order.count())).resolves.toBe(globexOrders);
      await expect(
        tenantDb.run(acme, (tx) => tx.order.count({ where: { tenantId: globexId } })),
      ).resolves.toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
