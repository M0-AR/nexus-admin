import { Injectable, LoggerService, Scope } from "@nestjs/common";
import pino, { Logger as PinoLogger } from "pino";
import { env } from "../config/env.ts";
import { getRequestContext } from "../tenancy/tenant.context.ts";

/**
 * Structured logging with automatic tenant/request binding (pattern #10:
 * tenant-scoped observability). Every log line emitted while a request is in
 * flight carries requestId, tenantId and userId.
 */
export const rootLogger = pino({
  level: env.LOG_LEVEL,
  base: { service: "nexus-api", region: env.APP_REGION },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const ctx = getRequestContext();
    return ctx
      ? { requestId: ctx.requestId, tenantId: ctx.tenantId, userId: ctx.userId }
      : {};
  },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash", "*.token"],
});

export function loggerFor(context: string): PinoLogger {
  return rootLogger.child({ context });
}

@Injectable({ scope: Scope.DEFAULT })
export class NestPinoLogger implements LoggerService {
  private readonly base = loggerFor("Nest");

  log(message: unknown, context?: string): void {
    this.base.child({ context: context ?? "Nest" }).info(message);
  }
  error(message: unknown, stack?: string, context?: string): void {
    this.base.child({ context: context ?? "Nest" }).error({ stack }, typeof message === "string" ? message : String(message));
  }
  warn(message: unknown, context?: string): void {
    this.base.child({ context: context ?? "Nest" }).warn(message);
  }
  debug(message: unknown, context?: string): void {
    this.base.child({ context: context ?? "Nest" }).debug(message);
  }
  verbose(message: unknown, context?: string): void {
    this.base.child({ context: context ?? "Nest" }).trace(message);
  }
}
