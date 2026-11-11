import "reflect-metadata";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function loadWorkspaceEnvironment() {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let directory = resolve(start);
    for (let level = 0; level < 8; level += 1) {
      try {
        await access(join(directory, "pnpm-workspace.yaml"));
        process.loadEnvFile(join(directory, ".env"));
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          if ((error as NodeJS.ErrnoException).code === "ERR_INVALID_ARG_VALUE") return;
          throw error;
        }
        directory = dirname(directory);
      }
    }
  }
}

async function runIndexer() {
  await loadWorkspaceEnvironment();
  // 独立索引进程默认启用索引；主 API 仍由 DEX_INDEXER_ENABLED 显式控制。
  process.env.DEX_INDEXER_ENABLED ??= "true";
  // 执行钱包只由 API 执行器服务读取，不允许索引进程使用该私钥。
  process.env.LIMIT_ORDER_EXECUTOR_PRIVATE_KEY = "";
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  console.info("链上行情索引服务已启动。");
}

void runIndexer();
