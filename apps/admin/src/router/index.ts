import { defineRouter } from "#q-app";
import { createRouter, createWebHistory } from "vue-router";
import { loadAdminInitializationStatus } from "@chainforge/shared-types";
import { canAccess, loadAdminSession } from "../services/admin-session";
import routes from "./routes";

export default defineRouter(() => {
  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory("/"),
  });

  router.beforeEach(async (to) => {
    let ready: boolean;
    try {
      ready = (await loadAdminInitializationStatus()).state === "ready";
    } catch {
      // 安装状态无法读取时回到初始化页，由页面显示具体错误并提供重试。
      return to.path === "/init" ? true : "/init";
    }

    if (!ready) return to.path === "/init" ? true : "/init";

    if (to.path === "/init") {
      try {
        return (await loadAdminSession()) ? "/" : "/login";
      } catch {
        return "/login";
      }
    }

    if (to.path === "/") {
      try {
        const session = await loadAdminSession();
        return session ? true : { path: "/login", query: { redirect: "/" } };
      } catch {
        return "/login";
      }
    }

    if (to.path === "/login") {
      try {
        const session = await loadAdminSession();
        return session ? "/" : true;
      } catch {
        return true;
      }
    }

    if (!to.meta.requiresAuth) return true;

    try {
      const session = await loadAdminSession();
      if (!session) {
        return { path: "/login", query: { redirect: to.fullPath } };
      }
      const permission = to.meta.permission;
      if (typeof permission === "string" && !canAccess(permission)) {
        return "/forbidden";
      }
      return true;
    } catch {
      return "/login";
    }
  });

  return router;
});
