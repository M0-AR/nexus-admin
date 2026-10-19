import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { RequestUser, RequestTenant } from "./request-types.ts";

export const IS_PUBLIC = "nexus:isPublic";
export const ROLES_KEY = "nexus:roles";
export const FEATURE_KEY = "nexus:feature";

/** Route requires no authentication (signup/login/refresh/branding resolve). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires one of the given tenant roles (pattern #4). */
export const Roles = (...roles: Array<RequestUser["role"]>) => SetMetadata(ROLES_KEY, roles);

/** Route requires a feature flag to be enabled for the tenant (pattern #9). */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    if (!req.user) throw new Error("CurrentUser used on a public route");
    return req.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestTenant => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { tenant?: RequestTenant }>();
    if (!req.tenant) throw new Error("CurrentTenant used on a public route");
    return req.tenant;
  },
);
