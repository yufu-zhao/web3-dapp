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
    return true;
  });

  return router;
});
