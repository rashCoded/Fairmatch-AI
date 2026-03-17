import { jwtDecode } from "jwt-decode";

const TOKEN_KEY = "fairmatch_token";
const REFRESH_KEY = "fairmatch_refresh";
const ROLE_KEY = "fairmatch_role";

interface JwtPayload {
  sub: string;
  type: string;
  exp: number;
  role?: "student" | "admin";
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredRole(): "student" | "admin" | null {
  if (typeof window === "undefined") return null;
  const role = localStorage.getItem(ROLE_KEY);
  return role === "student" || role === "admin" ? role : null;
}

export function setTokens(access: string, refresh: string, role?: "student" | "admin") {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);

  if (role) {
    localStorage.setItem(ROLE_KEY, role);
    setCookie(ROLE_KEY, role, 60 * 60 * 24 * 7);
  }

  // Keep token in cookie too so middleware can protect server-routed pages.
  setCookie(TOKEN_KEY, access, 60 * 60 * 24);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ROLE_KEY);

  clearCookie(TOKEN_KEY);
  clearCookie(ROLE_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getUserIdFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.sub;
  } catch {
    return null;
  }
}

export function getRoleFromToken(): "student" | "admin" | null {
  const token = getToken();
  if (!token) return null;
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    if (decoded.role === "student" || decoded.role === "admin") {
      return decoded.role;
    }
    return getStoredRole();
  } catch {
    return getStoredRole();
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}
