import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service.ts";
import { AuditController } from "./audit.controller.ts";
import { OrdersController } from "./orders.controller.ts";
import { ProductsController } from "./products.controller.ts";
import { MembersController } from "./members.controller.ts";
import { NotificationsController } from "./notifications.controller.ts";
import { SettingsController } from "./settings.controller.ts";
import { DashboardController } from "./dashboard.controller.ts";
import { DashboardService } from "./dashboard.service.ts";
import { AuthModule } from "../auth/auth.module.ts";
import { BillingModule } from "../billing/billing.module.ts";
import { CryptoModule } from "../crypto/crypto.module.ts";
import { TenancyModule } from "../tenancy/tenancy.module.ts";

@Module({
  imports: [AuthModule, BillingModule, CryptoModule, TenancyModule],
  controllers: [
    OrdersController,
    ProductsController,
    MembersController,
    NotificationsController,
    SettingsController,
    DashboardController,
    AuditController,
  ],
  providers: [AuditService, DashboardService],
  exports: [AuditService],
})
export class ResourcesModule {}
