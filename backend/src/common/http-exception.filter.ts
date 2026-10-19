import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { loggerFor } from "./logger.ts";
import { getRequestContext } from "../tenancy/tenant.context.ts";

const log = loggerFor("Exceptions");

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const requestId = getRequestContext()?.requestId;

    let body: ErrorBody;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        body = { statusCode: status, error: exception.name, message: payload };
      } else {
        const p = payload as Record<string, unknown>;
        body = {
          statusCode: status,
          error: String(p.error ?? exception.name),
          message: String(p.message ?? exception.message),
          code: p.code as string | undefined,
          details: p.details,
        };
      }
      if (status >= 500) {
        log.error({ err: exception, path: req.url }, "request failed");
      } else {
        log.warn({ status, path: req.url, code: body.code }, body.message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2025") {
      // Row not found (including cross-tenant lookups that RLS-predicated
      // queries cannot see). Treat as a plain 404, never a 500.
      body = {
        statusCode: HttpStatus.NOT_FOUND,
        error: "NotFound",
        message: "Resource not found",
        code: "NOT_FOUND",
      };
      log.warn({ path: req.url }, "prisma record not found");
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2002") {
      // Unique constraint violation (duplicate SKU, slug, membership, ...).
      // Never leak the raw constraint name to clients.
      body = {
        statusCode: HttpStatus.CONFLICT,
        error: "Conflict",
        message: "A record with this value already exists",
        code: "CONFLICT",
      };
      log.warn({ path: req.url }, "prisma unique constraint violated");
    } else if (exception instanceof ZodError) {
      body = {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "ValidationFailed",
        message: "Request validation failed",
        code: "VALIDATION_FAILED",
        details: exception.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
      log.warn({ path: req.url }, "zod validation failed");
    } else {
      log.error({ err: exception, path: req.url }, "unhandled exception");
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "InternalServerError",
        message: "An unexpected error occurred",
      };
    }

    body.requestId = requestId;
    void res.status(body.statusCode).send(body);
  }
}
