import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AdminAuthService } from "./admin-auth.service.js";
import {
  adminSessionClearCookie,
  adminSessionSetCookie,
  readAdminSessionCookie,
} from "./admin-cookie.js";
import { AdminSessionGuard } from "./admin-session.guard.js";
import type { AdminRequest } from "./admin.types.js";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  @Header("Cache-Control", "no-store")
  async login(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const result = await this.adminAuthService.login(body, request.ip);
    response.header("set-cookie", adminSessionSetCookie(result.token));
    return result.context;
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @UseGuards(AdminSessionGuard)
  me(@Req() request: AdminRequest) {
    return this.adminAuthService.context(request.adminPrincipal!);
  }

  @Post("logout")
  @Header("Cache-Control", "no-store")
  async logout(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    response.header("set-cookie", adminSessionClearCookie());
    await this.adminAuthService.logout(
      readAdminSessionCookie(request.headers.cookie),
    );
    return { ok: true };
  }
}
