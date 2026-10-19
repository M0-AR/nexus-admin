import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { FEATURE_KEY, IS_PUBLIC, ROLES_KEY } from "../common/decorators.ts";
import type { RequestTenant, RequestUser } from "../common/request-types.ts";
import { EntitlementsService } from "../billing/entitlements.service.ts";
import { PLANS, type FeatureKey } from "../billing/plans.ts";
import { env } from "../config/env.ts";
import { RateLimiterService } from "../ratelimit/rate-limiter.service.ts";

export type AccessRequest = FastifyRequest & { user?: RequestUser; tenant?: RequestTenant };

/**
 * Authorization layer: RBAC roles, plan-based feature flags, and per-tenant
 * rate limiting (patterns #4, #6, #9). Also throttles public auth endpoints
 * by IP to blunt credential stuffing.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitler: EntitlementsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AccessRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const route = (req as unknown as { routeOptions?: { url?: string } }).routeOptions?.url ?? req.url;
      if (req.method === "POST" && route.startsWith("/api/auth/")) {
        const decision = await this.rateLimiter.consumeIp(req.ip, "auth", env.AUTH_IP_LIMIT_PER_MINUTE, 60);
        if (!decision.allowed) throw this.tooManyRequests(decision.retryAfterSeconds, "Too many auth attempts");
      }
      return true;
    }

    const user = req.user;
    const tenant = req.tenant;
    if (!user || !tenant) {
      throw new ForbiddenException({ message: "Missing auth context", code: "NO_AUTH_CONTEXT" });
    }

    const roles = this.reflector.getAllAndOverride<RequestUser["role"][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException({
        message: `Requires role: ${roles.join(" or ")}`,
        code: "FORBIDDEN_ROLE",
      });
    }

    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (feature) {
      const ent = await this.entitler.effective(tenant);
      if (!ent.features[feature as FeatureKey]) {
        throw new ForbiddenException({
          message: `The "${feature}" feature is not enabled on the ${ent.plan.name} plan`,
          code: "FEATURE_NOT_ENABLED",
          details: { feature, plan: tenant.plan, upgradeHint: true },
        });
      }
    }

    const plan = PLANS[tenant.plan];
    const decision = await this.rateLimiter.consumeTenant(tenant.id, plan.requestsPerMinute);
    if (!decision.allowed) throw this.tooManyRequests(decision.retryAfterSeconds, "Workspace rate limit exceeded");

    return true;
  }

  private tooManyRequests(retryAfterSeconds: number, message: string): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "TooManyRequests",
        message,
        code: "RATE_LIMITED",
        details: { retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
