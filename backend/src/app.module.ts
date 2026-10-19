import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { RedisModule } from "./prisma/redis.module.ts";
import { TenancyModule } from "./tenancy/tenancy.module.ts";
import { BillingModule } from "./billing/billing.module.ts";
import { CryptoModule } from "./crypto/crypto.module.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { ResourcesModule } from "./resources/resources.module.ts";
import { MetricsModule } from "./metrics/metrics.module.ts";
import { AuthGuard } from "./auth/auth.guard.ts";
import { AccessGuard } from "./auth/access.guard.ts";
import { ContextInterceptor } from "./common/interceptors/context.interceptor.ts";
import { MetricsInterceptor } from "./common/interceptors/metrics.interceptor.ts";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor.ts";
import { AllExceptionsFilter } from "./common/http-exception.filter.ts";
import { RateLimiterService } from "./ratelimit/rate-limiter.service.ts";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    TenancyModule,
    BillingModule,
    CryptoModule,
    AuthModule,
    ResourcesModule,
    MetricsModule,
  ],
  providers: [
    RateLimiterService,
    // Guard order matters: authenticate first, then authorize.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    // Context interceptor is outermost so ALS wraps everything downstream.
    { provide: APP_INTERCEPTOR, useClass: ContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
