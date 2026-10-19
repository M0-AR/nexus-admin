import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.ts";
import { TenantDbService } from "./tenant-db.service.ts";

@Global()
@Module({
  providers: [PrismaService, TenantDbService],
  exports: [PrismaService, TenantDbService],
})
export class PrismaModule {}
