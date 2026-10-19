import { z } from "zod";

const boolFromString = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : ["true", "1", "yes"].includes(v.toLowerCase())));

export function parseDuration(input: string): number {
  const m = /^(\d+)\s*(s|m|h|d)?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid duration: ${input}`);
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit] as number);
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default("Nexus"),
  APP_REGION: z.string().default("us-east-1"),
  ENFORCE_REGION: boolFromString(false),
  /** Root domain for <slug>.<domain> tenant resolution, e.g. "nexus.app". */
  APP_ROOT_DOMAIN: z.string().default("localhost"),

  APP_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "APP_DATABASE_URL must be a postgres connection string"),

  REDIS_URL: z.string().regex(/^rediss?:\/\//, "REDIS_URL must be a redis connection string"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
  COOKIE_SECURE: boolFromString(false),

  MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "MASTER_KEY must be 64 hex characters (32 bytes)"),

  FRONTEND_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  /** Per-IP budget for public /api/auth/* POSTs (credential stuffing guard). */
  AUTH_IP_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),

  SEED_DEMO_DATA: boolFromString(true),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema> & { isProd: boolean; accessTokenTtlSeconds: number };

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;
  return {
    ...e,
    isProd: e.NODE_ENV === "production",
    accessTokenTtlSeconds: parseDuration(e.ACCESS_TOKEN_TTL),
  };
}

export const env = load();
