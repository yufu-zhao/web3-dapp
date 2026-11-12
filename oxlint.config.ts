import { defineConfig } from "oxlint";

export default defineConfig({
  $schema: "./node_modules/oxlint/configuration_schema.json",
  ignorePatterns: [
    "**/node_modules/",
    "**/dist/",
    "**/quasar.config.*.temporary.compiled*",
    "**/.quasar/",
    "**/src-cordova/",
    "**/src-capacitor/",
    "**/src/router/typed-router.d.ts"
  ],
  // 使用 Quasar 应用现有的 TypeScript、Vue 和通用规则分类。
  plugins: ["typescript", "vue", "import", "eslint", "promise", "unicorn"],
  categories: {
    correctness: "error"
  },
  rules: {},
  env: {
    builtin: true
  }
});
