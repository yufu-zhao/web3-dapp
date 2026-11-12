import type { RouteRecordRaw } from "vue-router";

// 栏目页面使用独立路由组件，共享持久布局和用户端状态。
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("../layouts/RegistrationGateLayout.vue"),
    children: [
      {
        path: "",
        component: () => import("../layouts/UserLayout.vue"),
        children: [
          { path: "", component: () => import("../pages/HomePage.vue") },
          {
            path: "presale",
            component: () => import("../pages/PresalePage.vue")
          },
          { path: "trade", component: () => import("../pages/TradePage.vue") },
          {
            path: "trade/records/:id",
            component: () => import("../pages/TradeRecordPage.vue")
          },
          { path: "mine", component: () => import("../pages/MinePage.vue") },
          {
            path: "mine/:feature(assets|staking|lock|referral|team|points|lottery|announcements|trades)",
            component: () => import("../pages/MineFeaturePage.vue")
          }
        ]
      },
      {
        path: "invite",
        component: () => import("../layouts/InvitationLayout.vue"),
        children: [
          { path: "", component: () => import("../pages/InvitationPage.vue") }
        ]
      }
    ]
  },
  { path: "/:catchAll(.*)*", redirect: "/" }
];

export default routes;
