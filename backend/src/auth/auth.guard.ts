import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import { IS_PUBLIC } from "../common/decorators.ts";
import type { RequestTenant, RequestUser } from "../common/request-types.ts";
import { RedisService } from "../prisma/redis.module.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { TenantsService } from "../tenancy/tenants.service.ts";

interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  tid: string;
  role: RequestUser["role"];
}

export type AuthedRequest = FastifyRequest & { user?: RequestUser; tenant?: RequestTenant };

/**
 * Authentication + tenant resolution (patterns #3, #4, #7).
 * Verifies the access JWT, re-checks that the tenant is active and the
 * membership is still ACTIVE (cached 60s), then attaches user + tenant.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly tenants: TenantsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        message: "Missing or malformed Authorization header",
        code: "UNAUTHENTICATED",
      });
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException({ message: "Invalid or expired token", code: "TOKEN_INVALID" });
    }

    const tenant = await this.tenants.getById(payload.tid);
    if (!tenant) {
      throw new UnauthorizedException({ message: "Unknown workspace", code: "TENANT_UNKNOWN" });
    }
    if (tenant.status === "SUSPENDED") {
      throw new ForbiddenException({ message: "This workspace is suspended", code: "TENANT_SUSPENDED" });
    }

    const membership = await this.membership(tenant, payload.sub);
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException({
        message: "Your membership in this workspace is not active",
        code: "MEMBERSHIP_INACTIVE",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: tenant.id,
      role: membership.role,
    };
    req.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      isolationMode: tenant.isolationMode,
      dedicatedDatabaseUrl: tenant.dedicatedDatabaseUrl,
      dataRegion: tenant.dataRegion,
      branding: (tenant.branding ?? {}) as RequestTenant["branding"],
      customDomain: tenant.customDomain,
      customDomainVerified: tenant.customDomainVerified,
      domainVerificationToken: tenant.domainVerificationToken,
    };
    return true;
  }

  private async membership(
    tenant: NonNullable<Awaited<ReturnType<TenantsService["getById"]>>>,
    userId: string,
  ): Promise<{ role: RequestUser["role"]; status: string } | null> {
    const key = `mb:${tenant.id}:${userId}`;
    const cached = await this.redis.getJson<{ role: RequestUser["role"]; status: string }>(key);
    if (cached) return cached;

    // Control-plane lookup (tenant registry join) — no RLS scope needed.
    const row = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
    });
    if (!row) return null;
    const value = { role: row.role, status: row.status };
    await this.redis.setJson(key, value, 30);
    return value;
  }
}
