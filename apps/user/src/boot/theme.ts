import { defineBoot } from "#q-app";
import {
  applyThemePalette,
  loadPublicInstallationConfig,
} from "@chainforge/shared-types";

export default defineBoot(() => {
  // 用户端在首屏请求安装身份时，也通过公开配置应用已保存的主题色。
  void loadPublicInstallationConfig()
    .then((config) => applyThemePalette("user", config.themePalettes))
    .catch(() => applyThemePalette("user", undefined));
});
