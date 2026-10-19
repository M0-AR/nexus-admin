import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Observable, tap } from "rxjs";

interface Bucket {
  total: number;
  durationMs: number;
  byStatus: Map<string, number>;
  byRoute: Map<string, number>;
}

/**
 * Tiny in-process Prometheus-style metrics registry. Enough for a single
 * node; for fleets, scrape every replica (see /api/metrics) or push to your
 * collector of choice.
 */
export const metrics: Bucket = {
  total: 0,
  durationMs: 0,
  byStatus: new Map(),
  byRoute: new Map(),
};

export function renderPrometheus(activeTenants: number): string {
  const lines: string[] = [];
  lines.push("# HELP nexus_http_requests_total Total HTTP requests");
  lines.push("# TYPE nexus_http_requests_total counter");
  lines.push(`nexus_http_requests_total ${metrics.total}`);
  for (const [status, count] of metrics.byStatus) {
    lines.push(`nexus_http_responses_total{status_class="${status}"} ${count}`);
  }
  lines.push("# HELP nexus_http_request_duration_ms_sum Cumulative request duration");
  lines.push("# TYPE nexus_http_request_duration_ms_sum counter");
  lines.push(`nexus_http_request_duration_ms_sum ${metrics.durationMs}`);
  lines.push("# HELP nexus_tenants_active Tenants currently active");
  lines.push("# TYPE nexus_tenants_active gauge");
  lines.push(`nexus_tenants_active ${activeTenants}`);
  for (const [route, count] of metrics.byRoute) {
    lines.push(`nexus_route_requests_total{route="${route}"} ${count}`);
  }
  return lines.join("\n") + "\n";
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();
    const started = process.hrtime.bigint();
    const route = (req as unknown as { routeOptions?: { url?: string } }).routeOptions?.url ?? req.url;

    return next.handle().pipe(
      tap({
        finalize: () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          metrics.total += 1;
          metrics.durationMs += ms;
          const cls = `${Math.floor(res.statusCode / 100)}xx`;
          metrics.byStatus.set(cls, (metrics.byStatus.get(cls) ?? 0) + 1);
          metrics.byRoute.set(route, (metrics.byRoute.get(route) ?? 0) + 1);
        },
      }),
    );
  }
}
