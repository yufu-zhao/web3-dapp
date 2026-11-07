import { ADMIN_SESSION_COOKIE } from "./admin.types.js";

export function readAdminSessionCookie(cookieHeader?: string | string[]) {
  const cookie = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== ADMIN_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : undefined;
  }
  return undefined;
}

export function adminSessionSetCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure}`;
}

export function adminSessionClearCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}
