import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.quasar/**"],
  },
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["apps/**/*.vue", "packages/**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
    },
  },
  {
    files: ["apps/installer/**/*.vue", "packages/wallet-connect/**/*.vue"],
    rules: {
      // 这些单文件组件由 Prettier 统一排版，关闭两套格式规则之间不一致的提示。
      "vue/html-closing-bracket-newline": "off",
      "vue/html-indent": "off",
      "vue/html-self-closing": ["error", { html: { void: "any" } }],
    },
  },
];
