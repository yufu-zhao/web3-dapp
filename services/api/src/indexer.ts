import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function runIndexerScaffold() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  // 当前没有索引任务；启动并正常关闭上下文，避免伪装成正在同步链上数据。
  await app.close();
  console.info("索引任务骨架已启动；当前没有待运行的索引任务。");
}

void runIndexerScaffold();
