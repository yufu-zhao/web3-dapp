import { defineBoot } from "#q-app";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import zhCN from "../i18n/zh-CN.json";

export interface UserLanguageOption {
  locale: string;
  name: string;
}

export const availableUserLanguages = ref<UserLanguageOption[]>([]);
const fallbackLocale = "zh-CN";
const messages: Record<string, Record<string, string>> = {
  [fallbackLocale]: zhCN,
};

export const i18n = createI18n({
  legacy: false,
  locale: fallbackLocale,
  fallbackLocale,
  messages,
});

// 用户选择保存在浏览器；服务端配置失效时回到内置简体中文。
export async function changeUserLanguage(locale: string) {
  if (
    !availableUserLanguages.value.some((language) => language.locale === locale)
  ) {
    return;
  }

  const response = await fetch(
    `/api/public/languages/${encodeURIComponent(locale)}/translations`,
    { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(`读取语言翻译失败（HTTP ${response.status}）`);

  const translations = (await response.json()) as Record<string, string>;
  i18n.global.setLocaleMessage(locale, {
    ...(locale === fallbackLocale ? zhCN : {}),
    ...translations,
  });
  i18n.global.locale.value = locale;
  localStorage.setItem("chainforge-user-locale", locale);
}

async function initializeUserLanguage() {
  try {
    const response = await fetch("/api/public/languages", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("读取可用语言失败");
    const result = (await response.json()) as {
      defaultLocale: string;
      languages: UserLanguageOption[];
    };
    availableUserLanguages.value = result.languages;
    const savedLocale = localStorage.getItem("chainforge-user-locale");
    const locale = result.languages.some(
      (language) => language.locale === savedLocale,
    )
      ? savedLocale!
      : result.defaultLocale;
    await changeUserLanguage(locale);
  } catch {
    availableUserLanguages.value = [
      { locale: fallbackLocale, name: "简体中文" },
    ];
    i18n.global.locale.value = fallbackLocale;
  }
}

export default defineBoot(({ app }) => {
  app.use(i18n);
  void initializeUserLanguage();
});
