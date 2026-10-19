import { Body, ConflictException, Controller, Get, HttpCode, Post, BadRequestException, Patch } from "@nestjs/common";
import { promises as dns } from "node:dns";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CurrentTenant, Roles, RequireFeature } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant, TenantBranding } from "../common/request-types.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { TenantsService } from "../tenancy/tenants.service.ts";
import { CryptoService } from "../crypto/crypto.service.ts";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB color");

const BrandingSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  logoText: z.string().trim().min(1).max(4).optional(),
  primaryColor: HexColor.optional(),
  accentColor: HexColor.optional(),
  faviconEmoji: z.string().trim().max(8).optional(),
});

const DomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a valid domain, e.g. app.acme.com"),
});

const RotateSchema = z.object({ key: z.string().trim().min(3).max(60).default("webhook_signing") });

/**
 * Pattern #7 (white-labeling) and #8 (BYOK secret vault) settings surface.
 * Branding drives per-tenant CSS variables in the frontend; secrets are
 * envelope-encrypted with the tenant DEK (see CryptoService).
 */
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
    private readonly tenants: TenantsService,
    private readonly crypto: CryptoService,
  ) {}

  @Get("branding")
  branding(@CurrentTenant() tenant: RequestTenant) {
    return { name: tenant.name, branding: tenant.branding as TenantBranding };
  }

  @Roles("OWNER", "ADMIN")
  @Patch("branding")
  async updateBranding(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(BrandingSchema)) body: z.infer<typeof BrandingSchema>,
  ) {
    const { name, ...branding } = body;
    const nextBranding = { ...(tenant.branding as Record<string, unknown>), ...branding };
    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { ...(name ? { name } : {}), branding: nextBranding },
    });
    await this.tenants.invalidate(tenant.id);
    return { name: updated.name, branding: updated.branding as TenantBranding };
  }

  @Roles("OWNER", "ADMIN")
  @RequireFeature("custom_domain")
  @Post("domain")
  async setDomain(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(DomainSchema)) body: z.infer<typeof DomainSchema>,
  ) {
    const clash = await this.prisma.tenant.findFirst({
      where: { customDomain: body.domain, id: { not: tenant.id } },
    });
    if (clash) {
      throw new ConflictException({ message: "That domain is already in use", code: "DOMAIN_TAKEN" });
    }
    const token = tenant.domainVerificationToken ?? `nexus-verify-${randomBytes(12).toString("hex")}`;
    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { customDomain: body.domain, customDomainVerified: false, domainVerificationToken: token },
    });
    await this.tenants.invalidate(tenant.id);
    return {
      domain: updated.customDomain,
      verified: updated.customDomainVerified,
      verificationToken: token,
      instructions: `Add a TXT record on ${body.domain} with the value "${token}", then press Verify.`,
    };
  }

  @Roles("OWNER", "ADMIN")
  @RequireFeature("custom_domain")
  @Post("domain/verify")
  @HttpCode(200)
  async verifyDomain(@CurrentTenant() tenant: RequestTenant) {
    if (!tenant.customDomain || !tenant.domainVerificationToken) {
      throw new BadRequestException({ message: "Add a custom domain first", code: "NO_DOMAIN" });
    }
    const records = await dns.resolveTxt(tenant.customDomain).catch(() => [] as string[][]);
    const flat = records.map((parts) => parts.join(""));
    const match = flat.some((value) => value.includes(tenant.domainVerificationToken as string));
    if (!match) {
      return {
        verified: false,
        code: "VERIFICATION_PENDING",
        message: `No TXT record with "${tenant.domainVerificationToken}" found yet. DNS can take a few minutes to propagate.`,
        found: flat,
      };
    }
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { customDomainVerified: true },
    });
    await this.tenants.invalidate(tenant.id);
    return { verified: true, domain: tenant.customDomain };
  }

  @Roles("OWNER", "ADMIN")
  @RequireFeature("byok")
  @Get("secrets")
  async listSecrets(@CurrentTenant() tenant: RequestTenant) {
    const rows = await this.tenantDb.run(tenant, (tx) => tx.integrationSecret.findMany({ orderBy: { key: "asc" } }));
    return {
      items: rows.map((row) => ({
        key: row.key,
        maskedValue: "whsec_••••••••••••",
        rotatedAt: row.lastRotatedAt.toISOString(),
      })),
    };
  }

  @Roles("OWNER")
  @RequireFeature("byok")
  @Post("secrets/rotate")
  @HttpCode(200)
  async rotateSecret(
    @CurrentTenant() tenant: RequestTenant,
    @Body(zodPipe(RotateSchema)) body: z.infer<typeof RotateSchema>,
  ) {
    const plaintext = `whsec_${randomBytes(24).toString("hex")}`;
    const sealed = await this.crypto.encryptForTenant(tenant, plaintext);
    const row = await this.tenantDb.run(tenant, (tx) =>
      tx.integrationSecret.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: body.key } },
        create: { tenantId: tenant.id, key: body.key, valueEncrypted: sealed, lastRotatedAt: new Date() },
        update: { valueEncrypted: sealed, lastRotatedAt: new Date() },
      }),
    );
    return {
      key: row.key,
      value: plaintext,
      rotatedAt: row.lastRotatedAt.toISOString(),
      note: "This is the only time the raw value is shown. It is stored AES-256-GCM encrypted with your workspace key.",
    };
  }
}
