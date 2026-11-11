import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminController } from "./admin.controller.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { AdminSessionGuard } from "./admin-session.guard.js";
import { AdminService } from "./admin.service.js";
import { DatabaseService } from "./database.service.js";
import { HealthController } from "./health.controller.js";
import { PublicConfigController } from "./public-config.controller.js";
import { PublicConfigService } from "./public-config.service.js";
import { ContentManagementService } from "./content-management.service.js";
import { PresaleRecordsService } from "./presale-records.service.js";
import { UserLanguagesService } from "./user-languages.service.js";
import { AiModelConfigurationService } from "./ai-model-configuration.service.js";
import { LimitOrdersController } from "./limit-orders.controller.js";
import { LimitOrdersService } from "./limit-orders.service.js";
import { LimitOrderExecutorService } from "./limit-order-executor.service.js";
import { MarketIndexerService } from "./market-indexer.service.js";

@Module({
  controllers: [HealthController, PublicConfigController, AdminAuthController, AdminController, LimitOrdersController],
  providers: [
    DatabaseService,
    PublicConfigService,
    ContentManagementService,
    PresaleRecordsService,
    UserLanguagesService,
    AiModelConfigurationService,
    LimitOrdersService,
    LimitOrderExecutorService,
    MarketIndexerService,
    AdminAuthService,
    AdminService,
    AdminSessionGuard,
    AdminPermissionGuard,
  ],
})
export class AppModule {}
