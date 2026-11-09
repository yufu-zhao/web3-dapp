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
        meta: {
          title: "环境检查",
        },
      },
      {
        path: "database",
        component: () => import("../pages/DatabasePage.vue"),
        meta: {
          title: "数据库连接",
        },
      },
      {
        path: "deploy",
        component: () => import("../pages/DeploymentPage.vue"),
        meta: {
          title: "部署合约",
        },
      },
      {
        path: "complete/:deploymentId",
        component: () => import("../pages/CompletePage.vue"),
        meta: {
          title: "完成",
        },
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/environment" },
];

export default routes;
