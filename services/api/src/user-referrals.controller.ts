import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { UserReferralsService } from "./user-referrals.service.js";

@Controller("public/users")
export class UserReferralsController {
  constructor(private readonly users: UserReferralsService) {}
  @Get(":address") account(
    @Param("address") address: string,
    @Req() request: FastifyRequest
  ) {
    return this.users.account(address, request.ip);
  }
  @Post("registration-challenge") challenge(@Body() body: unknown) {
    const address =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).address
        : undefined;
    return this.users.challenge(address);
  }
  @Post("register") register(
    @Body() body: unknown,
    @Req() request: FastifyRequest
  ) {
    return this.users.register(body, request.ip);
  }
  @Get(":address/referrals") referrals(@Param("address") address: string) {
    return this.users.referrals(address);
  }
}
