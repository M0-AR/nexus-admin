import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module.ts";
import { env } from "./config/env.ts";
import { NestPinoLogger, loggerFor } from "./common/logger.ts";

const log = loggerFor("Bootstrap");

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: new NestPinoLogger(),
  });

  // Security headers; this is an API — CSP is enforced by the frontend.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Refresh-token cookie support (scoped to /api/auth by TokenService).
  await app.register(cookie);

  // The dashboard talks to the API with credentials (refresh cookie).
  // @fastify/cors defaults to GET,HEAD,POST only — PATCH/DELETE (order & status
  // updates, member management) need to be listed explicitly or the browser
  // blocks the preflight.
  await app.register(cors, {
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-request-id"],
  });

  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  log.info(
    { port: env.PORT, region: env.APP_REGION, nodeEnv: env.NODE_ENV, enforceRegion: env.ENFORCE_REGION },
    "Nexus API ready",
  );
}

bootstrap().catch((err) => {
  log.error({ err }, "failed to start");
  process.exit(1);
});
