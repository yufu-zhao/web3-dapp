import { defineRouter } from "#q-app";
import { createRouter, createWebHistory } from "vue-router";
import routes from "./routes";

export default defineRouter(() =>
  createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createWebHistory("/"),
  }),
);
