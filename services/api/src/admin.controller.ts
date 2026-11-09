import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminService, type PageQuery } from "./admin.service.js";
import { RequireAdminPermission } from "./admin-permission.decorator.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { AdminSessionGuard } from "./admin-session.guard.js";
import type { AdminRequest } from "./admin.types.js";

@Controller("admin")
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
