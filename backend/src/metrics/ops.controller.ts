import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../common/decorators.ts";
import { renderPrometheus } from "../common/interceptors/metrics.interceptor.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { RedisService } from "../prisma/redis.module.ts";

/**
 * Ops surface: Prometheus-style /api/metrics (no external dep) plus
 * liveness/readiness probes for orchestrators (k8s, ECS, compose healthchecks).
 */
@Controller()
export class OpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get("metrics")
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(): Promise<string> {
    const activeTenants = await this.prisma.tenant.count({ where: { status: "ACTIVE" } }).catch(() => 0);
    return renderPrometheus(activeTenants);
  }

  @Public()
  @Get("healthz")
  health() {
    return { status: "ok", uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get("readyz")
  async ready() {
    const checks: Record<string, "ok" | "fail"> = { database: "fail", redis: "fail" };
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      checks.database = "ok";
    } catch {
      /* reported below */
    }
    try {
      const pong = await this.redis.client.ping();
      if (pong === "PONG") checks.redis = "ok";
    } catch {
      /* reported below */
    }
    const ok = Object.values(checks).every((v) => v === "ok");
    return { status: ok ? "ok" : "degraded", checks };
  }
}
