import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.quasar/**"],
  },
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["apps/*/env.d.ts"],
    rules: {
      // Quasar/Vite 依赖空的 ImportMetaEnv 声明作为环境变量扩展入口。
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
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
      "vue/html-self-closing": [
        "error",
        {
          html: {
            // Prettier 会把 HTML void 元素输出为 <br />，允许两种格式避免规则冲突。
            void: "any",
            normal: "never",
            component: "always",
          },
          svg: "always",
          math: "always",
        },
      ],
    },
  },
];
