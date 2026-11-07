import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  // 此接口只确认安装器服务可响应，不代表安装流程或依赖已就绪。
  @Get("init")
  init() {
    return {
      status: "ok",
      service: "installer",
    };
  }
}
