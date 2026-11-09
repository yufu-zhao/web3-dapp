// 安装身份是用户端、管理端与业务 API 共用的只读运行配置。
export interface UserThemePalette {
  accent: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
}

export interface AdminThemePalette {
  primary: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
}

export interface ThemePalettes {
  user: UserThemePalette;
  admin: AdminThemePalette;
}

// 默认配色与当前用户端深色品牌、管理端浅色工作台保持一致。
export const DEFAULT_THEME_PALETTES: ThemePalettes = {
  user: {
    accent: "#ffc832",
    background: "#111827",
    surface: "#1b2434",
    text: "#f9fafb",
    mutedText: "#cbd5e1",
  },
  admin: {
    primary: "#ffc832",
    background: "#f3f6fa",
    surface: "#ffffff",
    text: "#202d42",
    mutedText: "#738096",
    border: "#d9e0e9",
  },
};

export interface PublicInstallationConfig {
  installationStatus: "not_initialized" | "deployment_pending" | "ready";
  chainId: number | null;
  systemName: string;
  tokenName: string;
  tokenSymbol: string;
  themePalettes: ThemePalettes;
}

export interface PublicWalletConnectConfig {
  projectId: string | null;
}

// 将服务端返回的调色板映射到当前应用的 CSS 变量及 Quasar 主色。
export function applyThemePalette(
  target: "user" | "admin",
  palettes: ThemePalettes | undefined,
) {
  if (typeof document === "undefined") return;

  const root = document.body;
  const colorOrDefault = (color: string | undefined, fallback: string) =>
    typeof color === "string" && /^#[\da-f]{6}$/i.test(color)
      ? color
      : fallback;
  const cssKey = (key: string) =>
    key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const setPalette = (prefix: string, colors: object) => {
    for (const [key, color] of Object.entries(colors)) {
      root.style.setProperty(`--${prefix}-${cssKey(key)}`, color);
    }
  };
  const onPrimary = (color: string) => {
    const channels =
      color
        .slice(1)
        .match(/.{2}/g)
        ?.map((part) => parseInt(part, 16) / 255) ?? [];
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    const luminance =
      (linear[0] ?? 0) * 0.2126 +
      (linear[1] ?? 0) * 0.7152 +
      (linear[2] ?? 0) * 0.0722;
    return luminance > 0.45 ? "#17243b" : "#ffffff";
  };

  if (target === "user") {
    const input = palettes?.user ?? DEFAULT_THEME_PALETTES.user;
    const colors: UserThemePalette = {
      accent: colorOrDefault(input.accent, DEFAULT_THEME_PALETTES.user.accent),
      background: colorOrDefault(
        input.background,
        DEFAULT_THEME_PALETTES.user.background,
      ),
      surface: colorOrDefault(
        input.surface,
        DEFAULT_THEME_PALETTES.user.surface,
      ),
      text: colorOrDefault(input.text, DEFAULT_THEME_PALETTES.user.text),
      mutedText: colorOrDefault(
        input.mutedText,
        DEFAULT_THEME_PALETTES.user.mutedText,
      ),
    };
    setPalette("user", colors);
    root.style.setProperty("--user-on-primary", onPrimary(colors.accent));
    root.style.setProperty("--q-primary", colors.accent);
    return;
  }

  const input = palettes?.admin ?? DEFAULT_THEME_PALETTES.admin;
  const colors: AdminThemePalette = {
    primary: colorOrDefault(
      input.primary,
      DEFAULT_THEME_PALETTES.admin.primary,
    ),
    background: colorOrDefault(
      input.background,
      DEFAULT_THEME_PALETTES.admin.background,
    ),
    surface: colorOrDefault(
      input.surface,
      DEFAULT_THEME_PALETTES.admin.surface,
    ),
    text: colorOrDefault(input.text, DEFAULT_THEME_PALETTES.admin.text),
    mutedText: colorOrDefault(
      input.mutedText,
      DEFAULT_THEME_PALETTES.admin.mutedText,
    ),
    border: colorOrDefault(input.border, DEFAULT_THEME_PALETTES.admin.border),
  };
  setPalette("admin", colors);
  root.style.setProperty("--admin-on-primary", onPrimary(colors.primary));
  root.style.setProperty("--q-primary", colors.primary);
}

// 管理端首屏依据 API 返回的状态引导首次安装或进入已就绪页面。
export type AdminInitializationStatus =
  | { state: "ready"; installation: PublicInstallationConfig }
  | {
      state: "uninitialized" | "incomplete" | "migration-required";
      installation: null;
    };

// 前端通过同源 API 读取安装身份，避免把每个安装实例的名称编译进静态资源。
export async function loadPublicInstallationConfig() {
  const response = await fetch("/api/public/config", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`读取安装配置失败（HTTP ${response.status}）。`);
  }
  return (await response.json()) as PublicInstallationConfig;
}

// Reown Project ID 是公开标识，单独从 API 读取，不依赖数据库是否已初始化。
export async function loadWalletConnectConfig() {
  const response = await fetch("/api/public/wallet-config", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`读取钱包连接配置失败（HTTP ${response.status}）。`);
  }
  return (await response.json()) as PublicWalletConnectConfig;
}

// 检查数据库初始化标记和安装身份，不把 API/数据库故障误报为“未安装”。
export async function loadAdminInitializationStatus() {
  const response = await fetch("/api/public/initialization", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join("；")
      : payload?.message;
    throw new Error(
      message || `检查管理后台初始化状态失败（HTTP ${response.status}）。`,
    );
  }
  return (await response.json()) as AdminInitializationStatus;
}
