import { Controller, Get } from "@nestjs/common";
import { CurrentTenant } from "../common/decorators.ts";
import type { RequestTenant } from "../common/request-types.ts";
import { DashboardService } from "./dashboard.service.ts";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(@CurrentTenant() tenant: RequestTenant) {
    return this.dashboard.summary(tenant);
  }
}
