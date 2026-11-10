import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ContentManagementService } from "./content-management.service.js";
import { PublicConfigService } from "./public-config.service.js";
import { PresaleRecordsService } from "./presale-records.service.js";
import { UserLanguagesService } from "./user-languages.service.js";

@Controller("public")
export class PublicConfigController {
  constructor(
    private readonly publicConfigService: PublicConfigService,
    private readonly contentManagementService: ContentManagementService,
    private readonly presaleRecordsService: PresaleRecordsService,
    private readonly userLanguagesService: UserLanguagesService,
  ) {}

  @Get("content-management")
  @Header("Cache-Control", "no-store")
  contentManagement() {
    return this.contentManagementService.getPublicSettings();
  }

  @Get("content-assets/:name")
  async contentAsset(@Param("name") name: string, @Res() reply: FastifyReply) {
    const file = await this.contentManagementService.readAsset(name);
    return reply
      .header("Content-Type", file.contentType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .send(file.content);
  }

  @Post("presale-records")
  submitPresaleRecord(@Body() body: unknown) {
    const transactionHash =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).transactionHash
        : undefined;
    return this.presaleRecordsService.submitTransaction(transactionHash);
  }

  @Get("config")
  @Header("Cache-Control", "no-store")
  configuration() {
    return this.publicConfigService.getInstallationIdentity();
  }

  @Get("languages")
  @Header("Cache-Control", "no-store")
  publicLanguages() {
    return this.userLanguagesService.publicLanguages();
  }

  @Get("languages/:locale/translations")
  @Header("Cache-Control", "no-store")
  publicLanguageTranslations(@Param("locale") locale: string) {
    return this.userLanguagesService.publicTranslations(locale);
  }

  @Get("wallet-config")
  @Header("Cache-Control", "no-store")
  walletConfiguration() {
    return this.publicConfigService.getWalletConnectConfig();
  }

  @Get("mockusdt-config")
  @Header("Cache-Control", "no-store")
  mockUsdtConfiguration() {
    return {
      enabled: process.env.ENABLE_MOCKUSDT?.trim().toLowerCase() === "true",
    };
  }

  @Get("open-presale")
  @Header("Cache-Control", "no-store")
  openPresale() {
    return this.publicConfigService.getOpenPresale();
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
