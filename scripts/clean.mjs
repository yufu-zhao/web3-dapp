import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 只清理仓库根目录的构建产物。
rmSync(resolve(projectRoot, "dist"), { recursive: true, force: true });
