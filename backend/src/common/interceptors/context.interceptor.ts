import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { requestContext } from "../../tenancy/tenant.context.ts";
import type { RequestTenant, RequestUser } from "../request-types.ts";

/**
 * Enters the AsyncLocalStorage request context so that logging, audit and
 * usage accounting are automatically tenant-scoped. Guards run before
 * interceptors, so by now request.user / request.tenant are populated.
 */
@Injectable()
export class ContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest & { user?: RequestUser; tenant?: RequestTenant }>();
    const res = http.getResponse<FastifyReply>();

    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && incoming.length <= 64 ? incoming : randomUUID();
    res.header("x-request-id", requestId);

    // enterWith (not run) is required here: Nest subscribes to the observable
    // returned by intercept() *after* this method returns, so a run() scope
    // would not cover handler execution or downstream tap() callbacks.
    requestContext.enterWith({
      requestId,
      userId: req.user?.id,
      userEmail: req.user?.email,
      tenantId: req.tenant?.id,
      tenantSlug: req.tenant?.slug,
      role: req.user?.role,
    });
    return next.handle();
  }
}
