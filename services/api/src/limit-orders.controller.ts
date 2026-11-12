import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
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
  candles(
    @Query("interval") interval: string,
    @Query("from") from: string,
    @Query("to") to: string
  ) {
    return this.limitOrdersService.getCandles(interval, from, to);
  }

  @Get("trades")
  @Header("Cache-Control", "no-store")
  trades(@Query("limit") limit: string, @Query("side") side: string) {
    return this.limitOrdersService.listTrades(limit, side);
  }

  @Get("quote")
  @Header("Cache-Control", "no-store")
  quote(@Query("buy") buy: string, @Query("amountIn") amountIn: string) {
    return this.limitOrdersService.quote(
      buy === "true" ? true : buy === "false" ? false : undefined,
      amountIn
    );
  }

  @Get("orders/:owner")
  @Header("Cache-Control", "no-store")
  orders(@Param("owner") owner: string) {
    return this.limitOrdersService.listOrders(owner);
  }

  @Post("market-buys")
  @Header("Cache-Control", "no-store")
  createMarketBuy(@Body() body: unknown) {
    return this.limitOrdersService.createMarketBuyAttempt(body);
  }

  @Patch("market-buys/:id")
  @Header("Cache-Control", "no-store")
  recordMarketBuyStage(@Param("id") id: string, @Body() body: unknown) {
    return this.limitOrdersService.recordMarketBuyStage(id, body);
  }

  @Post("market-buys/:id/prepare")
  @Header("Cache-Control", "no-store")
  prepareMarketBuy(@Param("id") id: string, @Body() body: unknown) {
    return this.limitOrdersService.prepareMarketBuyAttempt(id, body);
  }

  @Get("market-buys/:owner")
  @Header("Cache-Control", "no-store")
  marketBuys(@Param("owner") owner: string) {
    return this.limitOrdersService.listMarketBuyAttempts(owner);
  }

  @Post("orders")
  @Header("Cache-Control", "no-store")
  submit(@Body() body: unknown) {
    return this.limitOrdersService.submitOrder(body);
  }
}
