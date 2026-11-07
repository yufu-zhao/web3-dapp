import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  InstallerService,
  type DatabaseSettings,
  type DeploymentRecord,
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

  @Get("config")
  publicConfig() {
    return this.installerService.publicConfig();
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
