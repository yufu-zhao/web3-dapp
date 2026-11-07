import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("../pages/IndexPage.vue"),
    children: [
      { path: "", redirect: "/environment" },
      {
        path: "environment",
        component: () => import("../pages/EnvironmentPage.vue"),
      },
      {
        path: "database",
        component: () => import("../pages/DatabasePage.vue"),
      },
      {
        path: "deploy",
        component: () => import("../pages/DeploymentPage.vue"),
      },
      {
        path: "complete/:deploymentId",
        component: () => import("../pages/CompletePage.vue"),
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/environment" },
];

export default routes;
