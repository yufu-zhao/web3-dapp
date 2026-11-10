import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  BadRequestException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminService, type PageQuery } from "./admin.service.js";
import { RequireAdminPermission } from "./admin-permission.decorator.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { AdminSessionGuard } from "./admin-session.guard.js";
import type { AdminRequest } from "./admin.types.js";
import { ContentManagementService } from "./content-management.service.js";
import { UserLanguagesService } from "./user-languages.service.js";
import { AiModelConfigurationService } from "./ai-model-configuration.service.js";
import {
  PresaleRecordsService,
  type PresaleRecordQuery,
} from "./presale-records.service.js";

@Controller("admin")
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly contentManagementService: ContentManagementService,
    private readonly presaleRecordsService: PresaleRecordsService,
    private readonly userLanguagesService: UserLanguagesService,
    private readonly aiModelConfigurationService: AiModelConfigurationService,
  ) {}

  @Get("content-management")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("content:read")
  getContentManagement() {
    return this.contentManagementService.getSettings();
  }

  @Put("content-management")
  @RequireAdminPermission("content:update")
  updateContentManagement(@Body() body: unknown) {
    return this.contentManagementService.updateSettings(body);
  }

  @Post("content-management/uploads")
  @RequireAdminPermission("content:update")
  async uploadContentAsset(@Req() request: AdminRequest) {
    const upload = request as AdminRequest & {
      file: (options?: { limits?: { fileSize?: number } }) => Promise<
        | {
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
          }
        | undefined
      >;
    };
    const file = await upload.file({ limits: { fileSize: 100 * 1024 * 1024 } });
    if (!file) throw new BadRequestException("请选择要上传的图片或视频。");
    return this.contentManagementService.saveAsset(
      file.filename,
      file.mimetype,
      await file.toBuffer(),
    );
  }

  // 在钱包请求前重新核验后台会话权限；链上角色仍由合约独立校验。
  @Get("presale/authorize/terms")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("presale:terms")
  authorizePresaleTerms() {
    return { allowed: true };
  }

  @Get("presale/authorize/schedule")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("presale:schedule")
  authorizePresaleSchedule() {
    return { allowed: true };
  }

  @Get("presale/authorize/finalize")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("presale:finalize")
  authorizePresaleFinalize() {
    return { allowed: true };
  }

  @Get("presale-records")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("presale:records:read")
  listPresaleRecords(@Query() query: PresaleRecordQuery) {
    return this.presaleRecordsService.list(query);
  }

  @Get("users")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("admins:read")
  listUsers(@Query() query: PageQuery) {
    return this.adminService.listUsers(query);
  }

  @Post("users")
  @RequireAdminPermission("admins:create")
  createUser(@Body() body: unknown) {
    return this.adminService.createUser(body);
  }

  @Patch("users/:id")
  @RequireAdminPermission("admins:update")
  updateUser(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.adminService.updateUser(id, body, request.adminPrincipal!.id);
  }

  @Delete("users/:id")
  @RequireAdminPermission("admins:delete")
  deleteUser(@Param("id") id: string, @Req() request: AdminRequest) {
    return this.adminService.deleteUser(id, request.adminPrincipal!.id);
  }

  @Get("roles")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("roles:read")
  listRoles(@Query() query: PageQuery) {
    return this.adminService.listRoles(query);
  }

  @Get("permissions")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("roles:read")
  listRolePermissions() {
    return this.adminService.listPermissionTree();
  }

  @Post("roles")
  @RequireAdminPermission("roles:create")
  createRole(@Body() body: unknown, @Req() request: AdminRequest) {
    return this.adminService.createRole(
      body,
      request.adminPrincipal!.permissions,
    );
  }

  @Patch("roles/:id")
  @RequireAdminPermission("roles:update")
  updateRole(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.adminService.updateRole(
      id,
      body,
      request.adminPrincipal!.permissions,
    );
  }

  @Delete("roles/:id")
  @RequireAdminPermission("roles:delete")
  deleteRole(@Param("id") id: string) {
    return this.adminService.deleteRole(id);
  }

  @Get("menus")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("menus:read")
  listMenus(@Query() query: PageQuery) {
    return this.adminService.listMenus(query);
  }

  @Patch("menus/:id")
  @RequireAdminPermission("menus:update")
  updateMenu(@Param("id") id: string, @Body() body: unknown) {
    return this.adminService.updateMenu(id, body);
  }

  @Get("settings")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("settings:read")
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch("settings")
  @RequireAdminPermission("settings:update")
  updateSettings(@Body() body: unknown) {
    return this.adminService.updateSettings(body);
  }

  @Get("settings/ai-model")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("settings:read")
  getAiModelConfiguration() {
    return this.aiModelConfigurationService.getConfiguration();
  }

  @Put("settings/ai-model")
  @RequireAdminPermission("settings:update")
  saveAiModelConfiguration(@Body() body: unknown) {
    return this.aiModelConfigurationService.saveConfiguration(body);
  }

  @Post("settings/ai-model/test")
  @RequireAdminPermission("settings:update")
  testAiModelConfiguration(@Body() body: unknown) {
    return this.aiModelConfigurationService.testConfiguration(body);
  }

  @Post("settings/ai-model/models")
  @RequireAdminPermission("settings:update")
  listAiModelOptions(@Body() body: unknown) {
    return this.aiModelConfigurationService.listModels(body);
  }

  @Get("languages")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("settings:read")
  listUserLanguages() {
    return this.userLanguagesService.list();
  }

  @Post("languages")
  @RequireAdminPermission("settings:update")
  createUserLanguage(@Body() body: unknown) {
    return this.userLanguagesService.create(body);
  }

  @Patch("languages/:id")
  @RequireAdminPermission("settings:update")
  updateUserLanguage(@Param("id") id: string, @Body() body: unknown) {
    return this.userLanguagesService.update(id, body);
  }

  @Delete("languages/:id")
  @RequireAdminPermission("settings:update")
  deleteUserLanguage(@Param("id") id: string) {
    return this.userLanguagesService.remove(id);
  }

  @Get("languages/:id/translations")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("settings:read")
  getUserLanguageTranslations(@Param("id") id: string) {
    return this.userLanguagesService.translations(id);
  }

  @Put("languages/:id/translations")
  @RequireAdminPermission("settings:update")
  saveUserLanguageTranslations(@Param("id") id: string, @Body() body: unknown) {
    return this.userLanguagesService.saveTranslations(id, body);
  }

  @Post("languages/:id/translations/ai-preview")
  @RequireAdminPermission("settings:update")
  previewUserLanguageTranslations(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.userLanguagesService.previewAiTranslations(id, body);
  }

  @Delete("languages/:id/translations/:key")
  @RequireAdminPermission("settings:update")
  deleteUserLanguageTranslation(
    @Param("id") id: string,
    @Param("key") key: string,
  ) {
    return this.userLanguagesService.removeTranslation(id, key);
  }

  @Post("settings/rpc/test")
  @RequireAdminPermission("settings:update")
  testRpcConfiguration(@Body() body: unknown) {
    return this.adminService.testRpcConfiguration(body);
  }
}
