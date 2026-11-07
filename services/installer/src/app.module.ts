import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { InstallerController } from "./installer.controller.js";
import { InstallerService } from "./installer.service.js";

@Module({
  controllers: [HealthController, InstallerController],
  providers: [InstallerService],
})
export class AppModule {}
