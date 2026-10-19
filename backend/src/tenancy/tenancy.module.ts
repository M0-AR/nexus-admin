import { Module } from "@nestjs/common";
import { TenantsService } from "./tenants.service.ts";
import { PublicTenantsController, TenantAdminController } from "./tenants.controller.ts";

@Module({
  controllers: [PublicTenantsController, TenantAdminController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenancyModule {}
