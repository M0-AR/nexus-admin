import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import type { StringValue } from "ms";
import { env } from "../config/env.ts";
import { TenancyModule } from "../tenancy/tenancy.module.ts";
import { BillingModule } from "../billing/billing.module.ts";
import { AuthController } from "./auth.controller.ts";
import { AuthService } from "./auth.service.ts";
import { TokenService } from "./token.service.ts";

@Module({
  imports: [
    // Global so the app-wide AuthGuard can verify access tokens anywhere.
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.ACCESS_TOKEN_TTL as StringValue },
    }),
    TenancyModule,
    BillingModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
