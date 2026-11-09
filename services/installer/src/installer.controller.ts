import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  InstallerService,
  type DatabaseSettings,
  type DeploymentRecord,
  type InstallationIdentity,
} from "./installer.service.js";

@Controller("installer")
export class InstallerController {
  constructor(private readonly installerService: InstallerService) {}

  @Get("environment")
  environment() {
    return this.installerService.environment();
  }

  @Post("database/check")
  checkDatabase(@Body() body: DatabaseSettings) {
    return this.installerService.checkDatabase(body);
  }

  @Post("database/initialize")
  initialize(@Body() body: Parameters<InstallerService["initialize"]>[0]) {
    return this.installerService.initialize(body);
  }

  @Post("database/migrate")
  migrateDatabase(@Req() request: FastifyRequest) {
    if (!isLoopbackAddress(request.ip)) {
      throw new ForbiddenException("数据库迁移仅允许本机安装器调用。");
    }
    return this.installerService.migrateDatabase();
  }

  @Post("database/use-existing")
  useExistingDatabase(
    @Req() request: FastifyRequest,
    @Body() body: { database?: DatabaseSettings },
  ) {
    // 切换本机安装目标会保存连接凭据，只允许本机安装器发起。
    if (!isLoopbackAddress(request.ip)) {
      throw new ForbiddenException("使用已有数据库仅允许本机安装器调用。");
    }
    return this.installerService.useExistingDatabase(body.database);
  }

  @Get("config")
  publicConfig() {
    return this.installerService.publicConfig();
  }

  @Get("wallet-config")
  @Header("Cache-Control", "no-store")
  walletConfig() {
    return this.installerService.walletConnectConfig();
  }

  @Post("config/installation")
  saveInstallationIdentity(
    @Body()
    body: Pick<
      InstallationIdentity,
      "systemName" | "tokenName" | "tokenSymbol"
    >,
  ) {
    return this.installerService.saveInstallationIdentity(body);
  }

  @Get("summary")
  summary() {
    return this.installerService.installationSummary();
  }

  @Post("deployment-records")
  addDeploymentRecord(@Body() body: DeploymentRecord) {
    return this.installerService.appendDeploymentRecord(body);
  }

  @Get("contracts/package")
  contractPackage(@Query("chainId") chainId: string) {
    return this.installerService.getContractPackage(Number(chainId));
  }

  @Post("contracts/compile")
  compileContracts() {
    return this.installerService.compileContracts();
  }

  @Get("contracts/deployments/:chainId")
  savedDeployments(@Param("chainId") chainId: string) {
    return this.installerService.getSavedDeployments(Number(chainId));
  }

  @Get("contracts/deployments/:chainId/:deploymentId")
  savedDeployment(
    @Param("chainId") chainId: string,
    @Param("deploymentId") deploymentId: string,
  ) {
    return this.installerService.getSavedDeployment(
      Number(chainId),
      deploymentId,
    );
  }

  @Post("contracts/deployments/:chainId")
  saveCompletedDeployment(
    @Param("chainId") chainId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.installerService.saveCompletedDeployment(Number(chainId), body);
  }

  @Post("contracts/deployments/:chainId/:deploymentId/activate")
  activateSavedDeployment(
    @Param("chainId") chainId: string,
    @Param("deploymentId") deploymentId: string,
  ) {
    return this.installerService.activateSavedDeployment(
      Number(chainId),
      deploymentId,
    );
  }

  @Get("contracts/pending")
  pendingDeployments() {
    return this.installerService.getPendingDeployments();
  }

  @Get("contracts/pending/:chainId")
  pendingDeployment(@Param("chainId") chainId: string) {
    return this.installerService.getPendingDeployment(Number(chainId));
  }

  @Post("contracts/pending/:chainId")
  savePendingDeployment(
    @Param("chainId") chainId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.installerService.savePendingDeployment(Number(chainId), body);
  }

  @Delete("contracts/pending/:chainId")
  clearPendingDeployment(@Param("chainId") chainId: string) {
    return this.installerService.clearPendingDeployment(Number(chainId));
  }

  @Get("contracts/tokens/:chainId")
  savedTokens(@Param("chainId") chainId: string) {
    return this.installerService.getSavedTokens(Number(chainId));
  }

  @Post("contracts/tokens/:chainId")
  saveToken(
    @Param("chainId") chainId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.installerService.addSavedToken(Number(chainId), body);
  }
}

function isLoopbackAddress(address: string) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address.startsWith("::ffff:127.")
  );
}
