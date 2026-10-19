import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { env } from "../config/env.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import type { MembershipRole } from "../generated/prisma/client.ts";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const REFRESH_COOKIE = "nexus_rt";
export const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Token lifecycle following 2026 best practice:
 *  - access token: short-lived JWT (default 15m), held in FE memory only
 *  - refresh token: 384-bit opaque secret in an HttpOnly, SameSite=Lax cookie
 *    scoped to /api/auth; only its SHA-256 hash is stored server-side
 *  - rotation with reuse detection: replaying a rotated token revokes the
 *    whole family and forces re-authentication
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(
    user: { id: string; email: string; name: string },
    tenantId: string,
    role: MembershipRole,
    meta: { userAgent?: string; ip?: string },
    family?: string,
  ): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      tid: tenantId,
      role,
    });

    const refreshToken = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tenantId,
        tokenHash: hashToken(refreshToken),
        family: family ?? randomUUID(),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
  }

  /**
   * Rotates a refresh token. Returns null on any failure; detects reuse and
   * revokes the entire family in that case.
   */
  async rotate(
    rawToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ tokens: IssuedTokens; userId: string; tenantId: string } | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!row) return null;

    if (row.revokedAt) {
      // Reuse of a rotated token → assume theft, revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { family: row.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    if (row.expiresAt.getTime() < Date.now()) return null;

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    const tenant = row.tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: row.tenantId } })
      : null;
    if (!user || !tenant) return null;
    if (tenant.status === "SUSPENDED") return null;

    // memberships is control-plane; no RLS scope needed here.
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    });
    if (!membership || membership.status !== "ACTIVE") return null;

    const tokens = await this.issue(user, tenant.id, membership.role, meta, row.family);

    const replacement = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(tokens.refreshToken) },
      select: { id: true },
    });
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedBy: replacement?.id },
    });

    return { tokens, userId: user.id, tenantId: tenant.id };
  }

  async revokeFamilyOf(rawToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!row) return;
    await this.prisma.refreshToken.updateMany({
      where: { family: row.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async familyTenant(rawToken: string): Promise<string | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  setRefreshCookie(reply: FastifyReply, tokens: IssuedTokens): void {
    void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      domain: env.COOKIE_DOMAIN,
      maxAge: Math.floor((tokens.refreshExpiresAt.getTime() - Date.now()) / 1000),
    });
  }

  clearRefreshCookie(reply: FastifyReply): void {
    void reply.setCookie(REFRESH_COOKIE, "", {
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      domain: env.COOKIE_DOMAIN,
      maxAge: 0,
    });
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
