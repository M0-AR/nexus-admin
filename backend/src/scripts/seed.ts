import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash, argon2id } from "argon2";
import { createStarterData } from "./starter-data.ts";
import { pickAvatarColor } from "../common/avatar.ts";
import { seal, open } from "../crypto/crypto.service.ts";
import { PLANS } from "../billing/plans.ts";

/**
 * Demo seed — run by docker/entrypoint.sh (node dist/scripts/seed.js) or
 * `npm run db:seed` locally. Idempotent: tenants are matched by slug and
 * starter data is only generated when a tenant has no orders yet.
 */

const PASSWORD = process.env.DEMO_PASSWORD ?? "Password123!";

interface SeedUser {
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
}

interface SeedTenant {
  slug: string;
  name: string;
  plan: "STARTER" | "PRO" | "ENTERPRISE";
  region: string;
  branding: Record<string, string>;
  users: SeedUser[];
}

const TENANTS: SeedTenant[] = [
  {
    slug: "acme",
    name: "Acme Corporation",
    plan: "ENTERPRISE",
    region: "us-east-1",
    branding: { logoText: "AC", primaryColor: "#6366f1", accentColor: "#8b5cf6", faviconEmoji: "⚡" },
    users: [
      { email: "owner@acme.test", name: "Ava Chen", role: "OWNER" },
      { email: "admin@acme.test", name: "Alex Rivera", role: "ADMIN" },
      { email: "manager@acme.test", name: "Mia Torres", role: "MANAGER" },
      { email: "member@acme.test", name: "Noah Kim", role: "MEMBER" },
    ],
  },
  {
    slug: "globex",
    name: "Globex Industries",
    plan: "STARTER",
    region: "us-east-1",
    branding: { logoText: "GX", primaryColor: "#14b8a6", accentColor: "#0ea5e9", faviconEmoji: "🌐" },
    users: [
      { email: "owner@globex.test", name: "Grace Hopper", role: "OWNER" },
      { email: "admin@globex.test", name: "Sam Patel", role: "ADMIN" },
    ],
  },
];

const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

/** Webhook signing secrets for the BYOK vault demo (Enterprise tenants only). */
const SECRETS: Record<string, { key: string; value: string; rotatedAt: Date }[]> = {
  acme: [
    { key: "STRIPE_WEBHOOK_SECRET", value: `whsec_${randomBytes(24).toString("hex")}`, rotatedAt: daysAgo(3) },
    { key: "GITHUB_WEBHOOK_SECRET", value: `whsec_${randomBytes(24).toString("hex")}`, rotatedAt: daysAgo(11) },
    { key: "SHOPIFY_WEBHOOK_SECRET", value: `whsec_${randomBytes(24).toString("hex")}`, rotatedAt: daysAgo(24) },
  ],
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    // Prefer the RLS-enforced runtime role so seeding exercises the same
    // policies the API uses (owner/superuser would silently bypass RLS).
    connectionString: (process.env["APP_DATABASE_URL"] ?? process.env["DATABASE_URL"]) as string,
  }),
});

async function tenantScope<T>(tenantId: string, fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`;
    return fn(tx);
  });
}

async function main(): Promise<void> {
  const passwordHash = await hash(PASSWORD, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  for (const spec of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: spec.slug },
      update: { name: spec.name, plan: spec.plan, branding: spec.branding, status: "ACTIVE" },
      create: {
        slug: spec.slug,
        name: spec.name,
        plan: spec.plan,
        status: "ACTIVE",
        dataRegion: spec.region,
        branding: spec.branding,
        domainVerificationToken: `nexus-verify-demo-${spec.slug}`,
      },
    });

    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: { plan: spec.plan, status: "ACTIVE", seats: PLANS[spec.plan].seats },
      create: {
        tenantId: tenant.id,
        plan: spec.plan,
        status: "ACTIVE",
        seats: PLANS[spec.plan].seats,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        stripeCustomerId: `cus_demo_${spec.slug}`,
      },
    });

    for (const member of spec.users) {
      const user = await prisma.user.upsert({
        where: { email: member.email },
        update: { name: member.name, passwordHash },
        create: {
          email: member.email,
          name: member.name,
          passwordHash,
          avatarColor: pickAvatarColor(member.email),
          lastLoginAt: new Date(),
        },
      });
      await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: { role: member.role, status: "ACTIVE" },
        create: { tenantId: tenant.id, userId: user.id, role: member.role },
      });
    }

    // Showcase a per-tenant feature override: Globex (Starter) gets the audit
    // log enabled beyond its plan — visible as an "override" in the UI.
    if (spec.slug === "globex") {
      await tenantScope(tenant.id, (tx) =>
        tx.featureOverride.upsert({
          where: { tenantId_feature: { tenantId: tenant.id, feature: "audit_log" } },
          create: { tenantId: tenant.id, feature: "audit_log", enabled: true },
          update: { enabled: true },
        }),
      );
    }

    const existingOrders = await tenantScope(tenant.id, (tx) => tx.order.count({ where: { tenantId: tenant.id } }));
    if (existingOrders === 0) {
      await tenantScope(tenant.id, (tx) => createStarterData(tx, tenant.id, { scale: "full" }));
      console.log(`  ✓ ${spec.slug}: starter data generated`);
    } else {
      console.log(`  → ${spec.slug}: already has ${existingOrders} orders, left untouched`);
    }

    // BYOK vault demo: webhook signing secrets for Enterprise tenants, sealed
    // with the tenant DEK exactly like the runtime rotate endpoint does.
    const secretSpecs = SECRETS[spec.slug] ?? [];
    if (secretSpecs.length > 0 && PLANS[spec.plan].features.byok) {
      const existingSecrets = await tenantScope(tenant.id, (tx) =>
        tx.integrationSecret.count({ where: { tenantId: tenant.id } }),
      );
      if (existingSecrets === 0) {
        const masterKeyHex = process.env["MASTER_KEY"] ?? "";
        if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
          throw new Error("MASTER_KEY (64 hex chars) is required to seed workspace secrets");
        }
        const masterKey = Buffer.from(masterKeyHex, "hex");
        await tenantScope(tenant.id, async (tx) => {
          const existingKey = await tx.tenantKey.findUnique({ where: { tenantId: tenant.id } });
          const dek = existingKey ? open(existingKey.wrappedDek, masterKey) : randomBytes(32);
          if (!existingKey) {
            await tx.tenantKey.create({ data: { tenantId: tenant.id, wrappedDek: seal(dek, masterKey) } });
          }
          for (const secret of secretSpecs) {
            await tx.integrationSecret.upsert({
              where: { tenantId_key: { tenantId: tenant.id, key: secret.key } },
              create: {
                tenantId: tenant.id,
                key: secret.key,
                valueEncrypted: seal(Buffer.from(secret.value, "utf8"), dek),
                lastRotatedAt: secret.rotatedAt,
              },
              update: {},
            });
          }
        });
        console.log(`  ✓ ${spec.slug}: ${secretSpecs.length} webhook secrets seeded`);
      } else {
        console.log(`  → ${spec.slug}: already has ${existingSecrets} secrets, left untouched`);
      }
    }

    console.log(`  ✓ ${spec.slug}: ${spec.users.length} users (${spec.plan})`);
  }

  console.log("");
  console.log("Seed complete. Demo sign-in:");
  console.log("  acme   owner@acme.test   / " + PASSWORD + "  (Enterprise)");
  console.log("  globex owner@globex.test / " + PASSWORD + "  (Starter)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
