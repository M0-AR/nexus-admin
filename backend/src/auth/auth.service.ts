import { z } from "zod";
import { randomBytes } from "node:crypto";
import { hash, verify, argon2id, type HashOptions } from "argon2";
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { MembershipRole, type Tenant, type User } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { TenantsService } from "../tenancy/tenants.service.ts";
import { EntitlementsService } from "../billing/entitlements.service.ts";
import { TokenService, type IssuedTokens } from "./token.service.ts";
import { PLANS } from "../billing/plans.ts";
import { loggerFor } from "../common/logger.ts";
import { createStarterData } from "../scripts/starter-data.ts";

const log = loggerFor("Auth");

const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456, // OWASP 2024+ recommendation (19 MiB)
  timeCost: 2,
  parallelism: 1,
};

export const SignupSchema = z.object({
  companyName: z.string().min(2).max(60),
  name: z.string().min(2).max(80),
  email: z.email().max(160),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
  region: z.enum(["us-east-1", "eu-central-1", "ap-southeast-1"]).default("us-east-1"),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.email().max(160),
  password: z.string().min(1).max(200),
  tenantSlug: z.string().min(1).max(60).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export interface AuthBundle {
  accessToken: string;
  user: { id: string; email: string; name: string; avatarColor: string };
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: Tenant["plan"];
    branding: Record<string, unknown>;
    dataRegion: string;
  };
  role: MembershipRole;
  memberships: Array<{ tenantId: string; slug: string; name: string; role: MembershipRole }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
    private readonly tenants: TenantsService,
    private readonly tokens: TokenService,
    private readonly entitlements: EntitlementsService,
  ) {}

  static async hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /** Pattern #3: self-serve provisioning — signup creates the whole tenant. */
  async signup(input: SignupInput, meta: { userAgent?: string; ip?: string }): Promise<{ bundle: AuthBundle; tokens: IssuedTokens }> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({ message: "An account with this email already exists", code: "EMAIL_TAKEN" });
    }

    const slug = await this.uniqueSlug(input.companyName);
    const passwordHash = await AuthService.hashPassword(input.password);
    const branding = defaultBranding(slug, input.companyName);

    const tenant = await this.prisma.tenant.create({
      data: {
        slug,
        name: input.companyName.trim(),
        status: "ACTIVE",
        plan: "STARTER",
        dataRegion: input.region,
        branding: branding as object,
        domainVerificationToken: `nexus-verify-${randomBytes(12).toString("hex")}`,
        subscription: {
          create: {
            plan: "STARTER",
            status: "TRIALING",
            seats: PLANS.STARTER.seats,
            currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
          },
        },
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        avatarColor: pickAvatarColor(email),
        lastLoginAt: new Date(),
      },
    });

    await this.tenantDb.run(toRef(tenant), async (tx) => {
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "OWNER" } });
      await createStarterData(tx, tenant.id, { scale: "small" });
    });

    log.info({ tenantId: tenant.id, slug }, "tenant provisioned");
    const tokens = await this.tokens.issue(user, tenant.id, "OWNER", meta);
    return { bundle: this.bundle(user, tenant, MembershipRole.OWNER, [{ tenantId: tenant.id, slug, name: tenant.name, role: MembershipRole.OWNER }]), tokens };
  }

  async login(input: LoginInput, meta: { userAgent?: string; ip?: string }): Promise<{ bundle: AuthBundle; tokens: IssuedTokens }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Equalize timing against the argon2 verify path.
      await verify(
        "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9v",
        "invalid",
      ).catch(() => false);
      throw new UnauthorizedException({ message: "Invalid email or password", code: "BAD_CREDENTIALS" });
    }

    const ok = await verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) throw new UnauthorizedException({ message: "Invalid email or password", code: "BAD_CREDENTIALS" });

    const memberships = await this.activeMemberships(user);
    if (memberships.length === 0) {
      throw new ForbiddenException({ message: "No active workspace memberships", code: "NO_MEMBERSHIP" });
    }

    let chosen = memberships[0];
    if (input.tenantSlug) {
      const match = memberships.find((m) => m.slug === input.tenantSlug);
      if (!match) {
        throw new ForbiddenException({ message: "You are not a member of this workspace", code: "NOT_A_MEMBER" });
      }
      chosen = match;
    } else if (memberships.length > 1) {
      throw new ConflictException({
        message: "You belong to multiple workspaces — choose one to continue",
        code: "TENANT_SELECTION_REQUIRED",
        details: { tenants: memberships },
      });
    }

    const tenant = await this.tenants.getById(chosen.tenantId);
    if (!tenant || tenant.status === "SUSPENDED") {
      throw new ForbiddenException({ message: "This workspace is unavailable", code: "TENANT_UNAVAILABLE" });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.tokens.issue(user, tenant.id, chosen.role, meta);
    return { bundle: this.bundle(user, tenant, chosen.role, memberships), tokens };
  }

  async refresh(rawToken: string, meta: { userAgent?: string; ip?: string }): Promise<{ bundle: AuthBundle; tokens: IssuedTokens } | null> {
    const rotated = await this.tokens.rotate(rawToken, meta);
    if (!rotated) return null;
    const user = await this.prisma.user.findUnique({ where: { id: rotated.userId } });
    const tenant = await this.tenants.getById(rotated.tenantId);
    if (!user || !tenant) return null;
    const memberships = await this.activeMemberships(user);
    const membership = memberships.find((m) => m.tenantId === tenant.id);
    if (!membership) return null;
    return { bundle: this.bundle(user, tenant, membership.role, memberships), tokens: rotated.tokens };
  }

  async switchTenant(
    userId: string,
    tenantSlug: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ bundle: AuthBundle; tokens: IssuedTokens }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ message: "Unknown user", code: "UNKNOWN_USER" });
    const memberships = await this.activeMemberships(user);
    const membership = memberships.find((m) => m.slug === tenantSlug);
    if (!membership) throw new ForbiddenException({ message: "You are not a member of this workspace", code: "NOT_A_MEMBER" });
    const tenant = await this.tenants.getById(membership.tenantId);
    if (!tenant) throw new ForbiddenException({ message: "Workspace unavailable", code: "TENANT_UNAVAILABLE" });
    // A tenant switch starts a fresh refresh-token family for the new tenant.
    const tokens = await this.tokens.issue(user, tenant.id, membership.role, meta);
    return { bundle: this.bundle(user, tenant, membership.role, memberships), tokens };
  }

  async me(userId: string): Promise<{ user: { id: string; email: string; name: string; avatarColor: string }; memberships: AuthBundle["memberships"] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ message: "Unknown user", code: "UNKNOWN_USER" });
    return {
      user: { id: user.id, email: user.email, name: user.name, avatarColor: user.avatarColor },
      memberships: await this.activeMemberships(user),
    };
  }

  private async activeMemberships(user: User): Promise<AuthBundle["memberships"]> {
    // memberships is a control-plane table (the tenant registry join), so this
    // cross-tenant lookup needs no RLS scope.
    const rows = await this.prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .filter((row) => row.tenant.status !== "SUSPENDED")
      .map((row) => ({
        tenantId: row.tenant.id,
        slug: row.tenant.slug,
        name: row.tenant.name,
        role: row.role,
      }));
  }

  private bundle(user: User, tenant: Tenant, role: MembershipRole, memberships: AuthBundle["memberships"]): AuthBundle {
    return {
      accessToken: "",
      user: { id: user.id, email: user.email, name: user.name, avatarColor: user.avatarColor },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        plan: tenant.plan,
        branding: (tenant.branding ?? {}) as Record<string, unknown>,
        dataRegion: tenant.dataRegion,
      },
      role,
      memberships,
    };
  }

  private async uniqueSlug(companyName: string): Promise<string> {
    const base =
      companyName
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "workspace";
    for (let i = 0; i < 50; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const clash = await this.prisma.tenant.findUnique({ where: { slug } });
      if (!clash) return slug;
    }
    return `${base}-${randomBytes(4).toString("hex")}`;
  }
}

function toRef(tenant: Tenant) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    isolationMode: tenant.isolationMode,
    dedicatedDatabaseUrl: tenant.dedicatedDatabaseUrl,
    dataRegion: tenant.dataRegion,
  };
}

const BRAND_PALETTES: Array<{ primaryColor: string; accentColor: string }> = [
  { primaryColor: "#6366f1", accentColor: "#8b5cf6" },
  { primaryColor: "#0ea5e9", accentColor: "#6366f1" },
  { primaryColor: "#14b8a6", accentColor: "#0ea5e9" },
  { primaryColor: "#f59e0b", accentColor: "#ef4444" },
  { primaryColor: "#ec4899", accentColor: "#8b5cf6" },
  { primaryColor: "#22c55e", accentColor: "#14b8a6" },
];

function defaultBranding(slug: string, name: string): Record<string, string> {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = BRAND_PALETTES[h % BRAND_PALETTES.length];
  return {
    ...palette,
    logoText: initials(name),
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "NX";
}

function pickAvatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BRAND_PALETTES[h % BRAND_PALETTES.length].primaryColor;
}
