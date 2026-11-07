import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { AdminRequest } from "./admin.types.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { readAdminSessionCookie } from "./admin-cookie.js";

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = readAdminSessionCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException("请先登录管理后台。");
    const principal = await this.adminAuthService.authenticate(token);
    if (!principal) throw new UnauthorizedException("登录已过期，请重新登录。");
    request.adminPrincipal = principal;
    return true;
  }
}
