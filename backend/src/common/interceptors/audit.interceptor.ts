import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Observable, tap } from "rxjs";
import { getRequestContext } from "../../tenancy/tenant.context.ts";
import { AuditService } from "../../resources/audit.service.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Derives a human-readable action name from the route, e.g. "order.status_changed". */
function deriveAction(method: string, route: string): { action: string; entity?: string } {
  const path = route.replace(/^\/api\//, "").replace(/\/:[^/]+/g, "").split("/").filter(Boolean);
  const entity = path[0];
  if (path.length >= 3) {
    return { action: path.slice(0, 3).join("."), entity };
  }
  const verb = { POST: "created", PUT: "updated", PATCH: "updated", DELETE: "deleted" }[method] ?? method.toLowerCase();
  return { action: entity ? `${entity}.${verb}` : `request.${verb}`, entity };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest & { params?: Record<string, string> }>();
    if (!MUTATING.has(req.method)) return next.handle();

    const route = (req as unknown as { routeOptions?: { url?: string } }).routeOptions?.url ?? req.url;
    const { action, entity } = deriveAction(req.method, route);

    return next.handle().pipe(
      tap(() => {
        const ctx = getRequestContext();
        if (!ctx?.tenantId) return;
        void this.audit.record({
          tenantId: ctx.tenantId,
          actorId: ctx.userId ?? null,
          actorEmail: ctx.userEmail ?? null,
          action,
          entity,
          entityId: (req.params as Record<string, string> | undefined)?.id,
          meta: { method: req.method, route },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }),
    );
  }
}
