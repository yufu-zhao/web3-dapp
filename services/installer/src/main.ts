import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );
  // 服务专用变量适配根目录配置，同时保留 PORT 和 HOST 的单服务回退方式。
  const port = Number(
    process.env.INSTALLER_SERVICE_PORT ?? process.env.PORT ?? 3611,
  );
  const host =
    process.env.INSTALLER_SERVICE_HOST ?? process.env.HOST ?? "127.0.0.1";
  // 未加载根目录环境文件时，默认允许三个本地前端开发地址。
  const defaultCorsOrigins = [
    "http://127.0.0.1:5675",
    "http://127.0.0.1:5676",
    "http://127.0.0.1:5677",
    "http://localhost:5675",
    "http://localhost:5676",
    "http://localhost:5677",
  ];
  const corsOrigins = (process.env.CORS_ORIGINS ?? defaultCorsOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // 仅放行环境变量中列出的前端来源。
  app.enableCors({ origin: corsOrigins });
  app.enableShutdownHooks();
  await app.listen(port, host);
}

void bootstrap();
