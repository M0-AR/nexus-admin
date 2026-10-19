import { Module } from "@nestjs/common";
import { OpsController } from "./ops.controller.ts";

@Module({
  controllers: [OpsController],
})
export class MetricsModule {}
