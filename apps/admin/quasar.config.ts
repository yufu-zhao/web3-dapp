import { defineConfig } from "#q-app";

export default defineConfig(() => ({
  boot: ["theme", "wallet-kit"],
  css: ["app.scss"],
  extras: ["material-icons", "fontawesome-v6"],
  build: {
    vueRouterMode: "history",
    distDir: "../../dist/apps/admin/spa",
    allowOutsideProjectDistDir: true,
    viteVuePluginOptions: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("appkit-"),
        },
      },
    },
  },
  devServer: {
    host: "127.0.0.1",
    // 独立端口变量便于通过根目录 .env 配置多应用开发服务。
    port: Number(process.env.ADMIN_PORT ?? 5676),
    open: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? 3610}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  framework: {
    config: {
      brand: {
        primary: "#FFC832",
      },
    },
    plugins: [
      "Dialog",
      "Notify",
      "Loading",
      "LocalStorage",
      "LoadingBar",
      "AppFullscreen",
    ],
  },
  animations: [],
}));
