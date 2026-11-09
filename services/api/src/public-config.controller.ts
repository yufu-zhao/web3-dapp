import { Controller, Get, Header } from "@nestjs/common";
import { PublicConfigService } from "./public-config.service.js";

@Controller("public")
export class PublicConfigController {
  constructor(private readonly publicConfigService: PublicConfigService) {}

  @Get("config")
  @Header("Cache-Control", "no-store")
  configuration() {
    return this.publicConfigService.getInstallationIdentity();
  }

  @Get("wallet-config")
  @Header("Cache-Control", "no-store")
  walletConfiguration() {
    return this.publicConfigService.getWalletConnectConfig();
  }

  @Get("runtime-contracts")
  @Header("Cache-Control", "no-store")
  runtimeContracts() {
    return this.publicConfigService.getRuntimeContracts();
  }

  @Get("initialization")
  @Header("Cache-Control", "no-store")
  initialization() {
    return this.publicConfigService.getAdminInitializationStatus();
  }
}
