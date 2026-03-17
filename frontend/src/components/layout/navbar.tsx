"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Compass,
  Briefcase,
  FileText,
  User,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearTokens, getToken } from "@/lib/auth";
import { getMe, getProfile } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";
import { Button } from "@/components/ui/button";

const studentLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/applications", label: "My Applications", icon: FileText },
];

const adminLinks = [
  { href: "/admin", label: "Analytics", icon: Shield },
  { href: "/admin/manage-internships", label: "Manage Internships", icon: Briefcase },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [studentFirstName, setStudentFirstName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const isLoggedIn = Boolean(token);
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/verify-otp";

  useEffect(() => {
    const storedToken = getToken();
    // This synchronizes auth state with localStorage on route transitions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(storedToken);
    setAuthChecked(true);

    if (!storedToken) {
      setUser(null);
      setStudentFirstName(null);
      return;
    }

    let isMounted = true;

    async function loadUser() {
      try {
        const me = await getMe();
        if (!isMounted) return;

        setUser(me);

        if (me.role === "student") {
          try {
            const profile = await getProfile();
            if (!isMounted) return;

            const firstName = profile.full_name?.trim().split(/\s+/)[0] ?? "";
            setStudentFirstName(firstName || null);
          } catch {
            if (isMounted) {
              setStudentFirstName(null);
            }
          }
        } else {
          setStudentFirstName(null);
        }
      } catch {
        if (!isMounted) return;

        clearTokens();
        setToken(null);
        setUser(null);
        setStudentFirstName(null);
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    // Intentional UI reset whenever route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/explore") {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        // Keep search input in sync with URL query on explore route.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSearchText(params.get("q") ?? "");
      }
      return;
    }

    // Reset search box on routes that do not use shared search behavior.
    setSearchText("");
  }, [pathname]);

  const runSearch = useCallback((rawQuery: string) => {
    const query = rawQuery.trim();

    if (!query) {
      if (pathname === "/explore") {
        router.push("/explore");
      }
      return;
    }

    const currentQuery = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q") ?? ""
      : "";
    if (pathname === "/explore" && currentQuery.trim().toLowerCase() === query.toLowerCase()) {
      return;
    }

    router.push(`/explore?q=${encodeURIComponent(query)}`);
  }, [pathname, router]);

  useEffect(() => {
    if (!isLoggedIn || isAuthPage) {
      return;
    }

    const query = searchText.trim();
    if (!query) {
      return;
    }

    const timeoutId = setTimeout(() => {
      runSearch(query);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchText, isLoggedIn, isAuthPage, pathname, runSearch]);

  const handleLogout = () => {
    clearTokens();
    setToken(null);
    setUser(null);
    setStudentFirstName(null);
    setMobileOpen(false);
    setMenuOpen(false);
    router.push("/login");
  };
  const links = user?.role === "admin" ? adminLinks : studentLinks;
  const displayName = studentFirstName || user?.email?.slice(0, 10) || "My Account";
  const avatarLetter = displayName.charAt(0).toUpperCase() || "U";

  const isLinkActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-navy/95 text-white backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-white font-bold text-sm">
            FM
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
            Fair<span className="text-green-accent">Match</span> AI
          </span>
        </Link>

        {isLoggedIn && !isAuthPage && (
          <nav className="ml-8 hidden items-center gap-2 md:flex">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/15 text-green-accent"
                      : "text-white/85 hover:bg-white/20 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        {isLoggedIn && !isAuthPage && (
          <div className="mx-6 hidden max-w-md flex-1 lg:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
              <input
                aria-label="Search"
                placeholder="Search internships, skills..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch(searchText);
                  }
                }}
                className="h-9 w-full rounded-lg border border-white/20 bg-white/10 pl-9 pr-9 text-sm text-white outline-none placeholder:text-white/60 transition-colors focus-visible:ring-2 focus-visible:ring-white/60"
              />
              {searchText.trim().length > 0 && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                  onClick={() => {
                    setSearchText("");
                    if (pathname === "/explore") {
                      router.push("/explore");
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {!authChecked ? null : isLoggedIn ? (
            <>
              {!isAuthPage && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Notifications"
                  className="text-white hover:bg-white/15 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/15 hover:text-white sm:hidden"
                onClick={handleLogout}
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>

              <div className="relative hidden sm:block">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white hover:bg-white/15 hover:text-white"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
                    {avatarLetter}
                  </span>
                  <span className="max-w-45 truncate">{displayName}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>

                {menuOpen && !isAuthPage && (
                  <div className="absolute right-0 top-11 w-48 rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">
                    <button
                      className="flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-slate-100"
                      onClick={() => {
                        setMenuOpen(false);
                        router.push(user?.role === "admin" ? "/admin" : "/profile/setup");
                      }}
                    >
                      <User className="mr-2 h-4 w-4" />
                      {user?.role === "admin" ? "Admin Panel" : "My Profile"}
                    </button>
                    <button
                      className="flex w-full items-center rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setMenuOpen(false);
                        handleLogout();
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : !isAuthPage ? (
            <Link href="/login">
              <Button variant="accent" size="sm">Sign In</Button>
            </Link>
          ) : null}

          {isLoggedIn && !isAuthPage && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/15 hover:text-white md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && isLoggedIn && !isAuthPage && (
        <div className="border-t border-white/10 bg-navy md:hidden">
          <nav className="mx-auto max-w-7xl px-4 py-3 space-y-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/15 text-green-accent"
                      : "text-white/85 hover:bg-white/20 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
            <button
              className="mt-2 flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-left text-sm font-medium text-red-100 transition-colors hover:bg-white/20 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
