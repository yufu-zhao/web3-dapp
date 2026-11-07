import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PublicConfigController } from "./public-config.controller.js";
import { PublicConfigService } from "./public-config.service.js";

@Module({
  controllers: [HealthController, PublicConfigController],
  providers: [PublicConfigService],
})
export class AppModule {}
