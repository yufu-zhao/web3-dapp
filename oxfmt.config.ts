import { defineConfig } from "oxfmt";

export default defineConfig({
  $schema: "./node_modules/oxfmt/configuration_schema.json",
  ignorePatterns: [
    "**/node_modules/",
    "**/dist/",
    "**/quasar.config.*.temporary.compiled*",
    "**/.quasar/",
    "**/src-cordova/",
    "**/src-capacitor/",
    "**/src/router/typed-router.d.ts"
  ],
  // 统一沿用 Quasar 应用的格式风格，供所有 workspace 共用。
  printWidth: 80,
  arrowParens: "avoid",
  bracketSpacing: true,
  bracketSameLine: false,
  htmlWhitespaceSensitivity: "strict",
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "none",
  useTabs: false,
  vueIndentScriptAndStyle: false
});
