import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ContainerInfo {
  ownerUrl: string;
  appUrl: string;
  redisUrl: string;
}

const info = JSON.parse(
  readFileSync(fileURLToPath(new URL("./.containers.json", import.meta.url)), "utf8"),
) as ContainerInfo;

// Must run before any shipped module imports config/env.ts (import-time parse).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = info.ownerUrl;
process.env.APP_DATABASE_URL = info.appUrl;
process.env.REDIS_URL = info.redisUrl;
process.env.JWT_SECRET = "test_jwt_secret_0123456789abcdef";
process.env.MASTER_KEY = "0123456789abcdef".repeat(4);
process.env.FRONTEND_ORIGIN = "http://localhost:3200";
process.env.APP_REGION = "us-east-1";
process.env.ACCESS_TOKEN_TTL = "15m";
