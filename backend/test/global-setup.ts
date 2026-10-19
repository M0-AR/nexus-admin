import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait } from "testcontainers";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, "..");

const DB = "nexus";
const OWNER_USER = "nexus_owner";
const OWNER_PASS = "nexus_dev_password";
const APP_USER = "app_user";
const APP_PASS = "nexus_dev_app_password";

const MASTER_KEY = "0123456789abcdef".repeat(4);
const JWT_SECRET = "test_jwt_secret_0123456789abcdef";

/**
 * Boots the real infrastructure the API runs against — Postgres 17 with the
 * NOBYPASSRLS runtime role, and Redis 7 — then applies the shipped migrations
 * and the shipped seed. Tests therefore exercise the same schema, roles and
 * policies as production; nothing is mocked and nothing is hand-approximated.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const pg = await new GenericContainer("postgres:17-alpine")
    .withEnvironment({
      POSTGRES_USER: OWNER_USER,
      POSTGRES_PASSWORD: OWNER_PASS,
      POSTGRES_DB: DB,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2).withStartupTimeout(120_000),
    )
    .start();

  const redis = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections", 1).withStartupTimeout(60_000))
    .start();

  const host = pg.getHost();
  const port = pg.getMappedPort(5432);
  const ownerUrl = `postgresql://${OWNER_USER}:${OWNER_PASS}@${host}:${port}/${DB}?schema=public`;
  const appUrl = `postgresql://${APP_USER}:${APP_PASS}@${host}:${port}/${DB}?schema=public`;
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  // Same role the initdb script creates in the compose stack.
  const role = await pg.exec([
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    OWNER_USER,
    "-d",
    DB,
    "-c",
    `CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASS}';
     ALTER ROLE ${APP_USER} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
     GRANT CONNECT ON DATABASE ${DB} TO ${APP_USER};`,
  ]);
  if (role.exitCode !== 0) {
    throw new Error(`failed to create runtime role: ${role.output}`);
  }

  const env = {
    ...process.env,
    DATABASE_URL: ownerUrl,
    APP_DATABASE_URL: appUrl,
    REDIS_URL: redisUrl,
    JWT_SECRET,
    MASTER_KEY,
    NODE_ENV: "test",
  };

  execFileSync(join(backendRoot, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: backendRoot,
    env,
    stdio: "pipe",
  });

  // Real fixtures, same as dev/prod demo data (acme + globex).
  execFileSync(join(backendRoot, "node_modules/.bin/tsx"), ["src/scripts/seed.ts"], {
    cwd: backendRoot,
    env,
    stdio: "pipe",
  });

  writeFileSync(join(here, ".containers.json"), JSON.stringify({ ownerUrl, appUrl, redisUrl }, null, 2));

  return async () => {
    await pg.stop().catch(() => undefined);
    await redis.stop().catch(() => undefined);
  };
}
