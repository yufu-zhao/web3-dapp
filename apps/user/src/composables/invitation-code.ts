const INVITATION_CODE_STORAGE_KEY = "chainforge-invitation-code";

// 支持注册链接参数与应用内重定向参数，并统一邀请码格式。
export function readInvitationCode(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate.trim().toUpperCase() : "";
}

// 在同一浏览器会话跨页面保留邀请码，避免连接钱包前的导航丢失邀请关系。
export function rememberInvitationCode(value: unknown): string {
  const code = readInvitationCode(value);
  if (typeof window !== "undefined") {
    if (code) window.sessionStorage.setItem(INVITATION_CODE_STORAGE_KEY, code);
    else window.sessionStorage.removeItem(INVITATION_CODE_STORAGE_KEY);
  }
  return code;
}

export function getRememberedInvitationCode(): string {
  if (typeof window === "undefined") return "";
  return readInvitationCode(
    window.sessionStorage.getItem(INVITATION_CODE_STORAGE_KEY)
  );
}

export function clearRememberedInvitationCode() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(INVITATION_CODE_STORAGE_KEY);
  }
}
