import { defineConfig } from "#q-app";

export default defineConfig(() => ({
  boot: [],
  css: ["app.scss"],
  extras: ["material-icons"],
  build: {
    vueRouterMode: "history",
    distDir: "../../dist/apps/installer/spa",
    allowOutsideProjectDistDir: true,
  },
  devServer: {
    host: "127.0.0.1",
    // 独立端口变量便于通过根目录 .env 配置多应用开发服务。
    port: Number(process.env.INSTALLER_UI_PORT ?? 5677),
    open: false,
  },
  framework: {
    config: {
      brand: {
        primary: "#FFC832",
      },
    },
    plugins: ["Dialog", "Notify", "Loading", "LocalStorage", "Meta"],
  },
  animations: [],
}));
