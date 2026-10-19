import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/scripts/seed.ts",
  },
  datasource: {
    // Owner connection — migrations and seeding only. The runtime API uses
    // APP_DATABASE_URL (app_user, NOBYPASSRLS) via PrismaService.
    url: process.env["DATABASE_URL"],
  },
});
