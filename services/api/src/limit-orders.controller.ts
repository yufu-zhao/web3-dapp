import { Body, Controller, Get, Header, Param, Post, Query } from "@nestjs/common";
import { LimitOrdersService } from "./limit-orders.service.js";

@Controller("public/limit-orders")
export class LimitOrdersController {
  constructor(private readonly limitOrdersService: LimitOrdersService) {}

  @Get("market")
  @Header("Cache-Control", "no-store")
  market() {
    return this.limitOrdersService.getMarket();
  }

  @Get("candles")
  @Header("Cache-Control", "no-store")
  candles(@Query("interval") interval: string, @Query("from") from: string, @Query("to") to: string) {
    return this.limitOrdersService.getCandles(interval, from, to);
  }

  @Get("trades")
  @Header("Cache-Control", "no-store")
  trades(@Query("limit") limit: string) {
    return this.limitOrdersService.listTrades(limit);
  }

  @Get("quote")
  @Header("Cache-Control", "no-store")
  quote(@Query("buy") buy: string, @Query("amountIn") amountIn: string) {
    return this.limitOrdersService.quote(buy === "true" ? true : buy === "false" ? false : undefined, amountIn);
  }

  @Get("orders/:owner")
  @Header("Cache-Control", "no-store")
  orders(@Param("owner") owner: string) {
    return this.limitOrdersService.listOrders(owner);
  }

  @Post("orders")
  @Header("Cache-Control", "no-store")
  submit(@Body() body: unknown) {
    return this.limitOrdersService.submitOrder(body);
  }
}
