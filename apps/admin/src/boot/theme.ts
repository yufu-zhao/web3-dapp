import { defineBoot } from "#q-app";
import {
  applyThemePalette,
  loadPublicInstallationConfig,
} from "@chainforge/shared-types";

export default defineBoot(() => {
  // 登录前也读取公开主题配置，使登录页与管理工作台使用同一套配色。
  void loadPublicInstallationConfig()
    .then((config) => applyThemePalette("admin", config.themePalettes))
    .catch(() => applyThemePalette("admin", undefined));
});
