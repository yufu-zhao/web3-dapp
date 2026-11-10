import type { RouteRecordRaw } from "vue-router";

// 所有栏目共享同一页面壳，详情路由只接受明确列出的功能。
const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("../pages/IndexPage.vue") },
  { path: "/presale", component: () => import("../pages/IndexPage.vue") },
  { path: "/trade", component: () => import("../pages/IndexPage.vue") },
  { path: "/mine", component: () => import("../pages/IndexPage.vue") },
  {
    path: "/mine/:feature(assets|staking|lock|referral|team|points|lottery|announcements|trades)",
    component: () => import("../pages/IndexPage.vue"),
  },
  { path: "/:catchAll(.*)*", redirect: "/" },
];

export default routes;
