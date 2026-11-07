import { defineRouter } from "#q-app";
import { createRouter, createWebHistory } from "vue-router";
import { loadAdminInitializationStatus } from "@filereset/shared-types";
import { AdminApiError } from "../services/admin-api";
import {
  canAccess,
  firstMenuPath,
  loadAdminSession,
} from "../services/admin-session";
import routes from "./routes";

export default defineRouter(() => {
  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory("/"),
  });

  router.beforeEach(async (to) => {
    let ready = false;
    try {
      ready = (await loadAdminInitializationStatus()).state === "ready";
    } catch {
      // 安装状态无法读取时回到初始化页，由页面显示具体错误并提供重试。
      return to.path === "/" ? true : "/";
    }

    if (!ready) return to.path === "/" ? true : "/";

    if (to.path === "/") {
      try {
        const session = await loadAdminSession();
        return session
          ? (firstMenuPath(session.menus) ?? "/forbidden")
          : "/login";
      } catch {
        return "/login";
      }
    }

    if (to.path === "/login") {
      try {
        const session = await loadAdminSession();
        return session ? (firstMenuPath(session.menus) ?? "/forbidden") : true;
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
    } catch (error) {
      if (error instanceof AdminApiError) return "/login";
      return "/login";
    }
  });

  return router;
});
