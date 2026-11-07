import "reflect-metadata";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

async function loadWorkspaceEnvironment() {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  let workspaceRoot: string | undefined;
  for (const start of starts) {
    let directory = resolve(start);
    for (let level = 0; level < 8; level += 1) {
      try {
        await access(join(directory, "pnpm-workspace.yaml"));
        workspaceRoot = directory;
        break;
      } catch {
        directory = dirname(directory);
      }
    }
    if (workspaceRoot) break;
  }
  if (!workspaceRoot) return;

  try {
    // API_PORT 等显式进程变量优先，根目录 .env 为本地开发提供默认值。
    process.loadEnvFile(join(workspaceRoot, ".env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function bootstrap() {
  await loadWorkspaceEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );
  // 服务专用变量适配根目录配置，同时保留 PORT 和 HOST 的单服务回退方式。
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3610);
  const host = process.env.API_HOST ?? process.env.HOST ?? "127.0.0.1";
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
