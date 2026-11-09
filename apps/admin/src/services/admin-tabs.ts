export interface AdminPageTab {
  path: string;
  title: string;
}

const STORAGE_PREFIX = "chainforge.admin.open-tabs.";

// 按管理员账号保存打开的页面，刷新或切换账号后仍能恢复各自的标签。
export function loadAdminPageTabs(userId: string): AdminPageTab[] {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!value) return [];

    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is AdminPageTab =>
        typeof item === "object" &&
        item !== null &&
        "path" in item &&
        typeof item.path === "string" &&
        item.path.startsWith("/") &&
        "title" in item &&
        typeof item.title === "string",
    );
  } catch {
    // 隐私模式或浏览器存储不可用时，标签仍可在当前页面正常使用。
    return [];
  }
}

// 标签信息不含认证凭据，只用于恢复同一管理员的页面导航状态。
export function saveAdminPageTabs(userId: string, tabs: AdminPageTab[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(tabs));
  } catch {
    // 浏览器存储空间不足时保留内存中的标签状态。
  }
}
