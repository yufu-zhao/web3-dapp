import { defineRouter } from "#q-app";
import { createRouter, createWebHistory } from "vue-router";
import routes from "./routes";
import {
  bootstrapInstallerFlow,
  installerFlow,
} from "../services/installer-flow";

export default defineRouter(() => {
  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory("/"),
  });

  router.beforeEach(async (to) => {
    await bootstrapInstallerFlow();
    if (to.path === "/environment") return true;
    if (!installerFlow.environmentReady) return "/environment";
    if (to.path === "/database") return true;
    if (!installerFlow.databaseReady) return "/database";
    if (to.path.startsWith("/complete")) return true;
    if (!installerFlow.summary.installation) return "/database";
    return true;
  });

  // 按当前安装步骤更新浏览器标签，避免空标题时浏览器退回显示网址。
  router.afterEach((to) => {
    const pageTitle = to.meta.title;
    document.title =
      typeof pageTitle === "string" && pageTitle.length > 0
        ? `${pageTitle} - 链构安装器`
        : "链构安装器";
  });

  return router;
});
