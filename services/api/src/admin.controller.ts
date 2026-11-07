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

  @Get("users")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("admins:read")
  listUsers(@Query() query: PageQuery) {
    return this.adminService.listUsers(query);
  }

  @Post("users")
  @RequireAdminPermission("admins:write")
  createUser(@Body() body: unknown) {
    return this.adminService.createUser(body);
  }

  @Patch("users/:id")
  @RequireAdminPermission("admins:write")
  updateUser(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.adminService.updateUser(id, body, request.adminPrincipal!.id);
  }

  @Delete("users/:id")
  @RequireAdminPermission("admins:write")
  deleteUser(@Param("id") id: string, @Req() request: AdminRequest) {
    return this.adminService.deleteUser(id, request.adminPrincipal!.id);
  }

  @Get("roles")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("roles:read")
  listRoles(@Query() query: PageQuery) {
    return this.adminService.listRoles(query);
  }

  @Post("roles")
  @RequireAdminPermission("roles:write")
  createRole(@Body() body: unknown) {
    return this.adminService.createRole(body);
  }

  @Patch("roles/:id")
  @RequireAdminPermission("roles:write")
  updateRole(@Param("id") id: string, @Body() body: unknown) {
    return this.adminService.updateRole(id, body);
  }

  @Delete("roles/:id")
  @RequireAdminPermission("roles:write")
  deleteRole(@Param("id") id: string) {
    return this.adminService.deleteRole(id);
  }

  @Get("menus")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("menus:read")
  listMenus(@Query() query: PageQuery) {
    return this.adminService.listMenus(query);
  }

  @Post("menus")
  @RequireAdminPermission("menus:write")
  createMenu(@Body() body: unknown) {
    return this.adminService.createMenu(body);
  }

  @Patch("menus/:id")
  @RequireAdminPermission("menus:write")
  updateMenu(@Param("id") id: string, @Body() body: unknown) {
    return this.adminService.updateMenu(id, body);
  }

  @Delete("menus/:id")
  @RequireAdminPermission("menus:write")
  deleteMenu(@Param("id") id: string) {
    return this.adminService.deleteMenu(id);
  }

  @Get("settings")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("settings:read")
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch("settings")
  @RequireAdminPermission("settings:write")
  updateSettings(@Body() body: unknown) {
    return this.adminService.updateSettings(body);
  }
}
