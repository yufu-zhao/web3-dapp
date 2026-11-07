import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_PERMISSION_METADATA } from "./admin-permission.decorator.js";
import type { AdminPermission, AdminRequest } from "./admin.types.js";

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<AdminPermission>(
      ADMIN_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const permissions = request.adminPrincipal?.permissions ?? [];
    if (permissions.includes("*") || permissions.includes(required)) {
      return true;
    }
    throw new ForbiddenException("当前角色没有执行此操作的权限。");
  }
}
