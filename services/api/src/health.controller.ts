import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  // 此接口只确认 HTTP 服务可响应，不检查数据库或外部依赖。
  @Get("init")
  init() {
    return {
      status: "ok",
      service: "api",
    };
  }
}
