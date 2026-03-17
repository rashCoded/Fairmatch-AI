import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_ROUTES = ["/login", "/register", "/verify-otp"];

function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return decoded;
  } catch {
    return null;
  }
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete("fairmatch_token");
  response.cookies.delete("fairmatch_role");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("fairmatch_token")?.value;
  const role = request.cookies.get("fairmatch_role")?.value;
  const payload = token ? parseJwtPayload(token) : null;
  const isTokenValid = Boolean(
    token && payload && (!payload.exp || payload.exp * 1000 > Date.now())
  );

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isProtectedStudentRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/explore" ||
    pathname.startsWith("/explore/") ||
    pathname === "/applications" ||
    pathname.startsWith("/applications/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/");

  if (isAuthRoute && isTokenValid) {
    const target = role === "admin" ? "/admin" : "/dashboard";
    return NextResponse.redirect(new URL(target, request.url));
  }

  if ((isAdminRoute || isProtectedStudentRoute) && !isTokenValid) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearAuthCookies(response);
    return response;
  }

  if (isAdminRoute && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedStudentRoute && role === "admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/register",
    "/verify-otp",
    "/dashboard/:path*",
    "/explore/:path*",
    "/applications/:path*",
    "/profile/:path*",
    "/admin/:path*",
  ],
};
