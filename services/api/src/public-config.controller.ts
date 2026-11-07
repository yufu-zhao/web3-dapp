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

  @Get("initialization")
  @Header("Cache-Control", "no-store")
  initialization() {
    return this.publicConfigService.getAdminInitializationStatus();
  }
}
