import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.ts";
import { TenancyModule } from "../tenancy/tenancy.module.ts";
import { BillingController } from "./billing.controller.ts";
import { EntitlementsService } from "./entitlements.service.ts";
import { UsageService } from "./usage.service.ts";

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [BillingController],
  providers: [EntitlementsService, UsageService],
  exports: [EntitlementsService, UsageService],
})
export class BillingModule {}
