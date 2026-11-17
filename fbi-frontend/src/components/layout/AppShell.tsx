"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Bookmark, FileSearch, LogOut, MapPin, Menu, Users, X, type LucideIcon } from "lucide-react";
import { useRole, useUsername } from "@/src/lib/use-role";
import { cn } from "@/src/lib/cn";
import { Badge } from "@/src/components/ui/Badge";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ConnectionStatus } from "./ConnectionStatus";
import { Footer } from "./Footer";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Wanted", icon: Users },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/my-location", label: "My location", icon: MapPin },
  { href: "/reports", label: "Reports", icon: FileSearch, adminOnly: true },
  { href: "/stats", label: "Statistics", icon: BarChart3, adminOnly: true },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/wanted") : pathname.startsWith(href);

// Header, navigation (desktop + mobile), user/role, live status, theme toggle and footer for
// every signed-in page. /auth pages render without it.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return <>{children}</>;
  return <Shell pathname={pathname}>{children}</Shell>;
}

function Shell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const role = useRole();
  const username = useUsername();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(pathname);

  // Close the mobile menu after navigating (state adjusted during render, no effect needed).
  if (menuFor !== pathname) {
    setMenuFor(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    router.push("/auth/login");
  };

  const items = NAV.filter((item) => !item.adminOnly || role === "ADMIN");

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-[1200] rounded-md bg-primary px-4 py-2 font-semibold text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-[1000] border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
        <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-4 sm:px-8">
          <Logo />

          <nav aria-label="Main" className="hidden h-full items-stretch gap-6 lg:flex">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center border-b-3 pt-[3px] text-[15px] font-medium transition-colors",
                    active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden md:inline-flex">
              <ConnectionStatus />
            </span>
            <span className="md:hidden">
              <ConnectionStatus compact />
            </span>
            {username && (
              <span className="hidden items-center gap-2 text-sm xl:inline-flex">
                <span className="font-medium">{username}</span>
                {role && <Badge tone={role === "ADMIN" ? "primary" : "neutral"}>{role}</Badge>}
              </span>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="max-lg:hidden">
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </Button>
            <IconButton
              label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="lg:hidden"
            >
              {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </IconButton>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="border-t border-border bg-bg lg:hidden">
            <nav aria-label="Main" className="mx-auto grid max-w-page gap-1 px-4 py-3 sm:px-8">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 font-medium",
                      active ? "bg-primary-soft text-primary" : "text-fg hover:bg-subtle",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mx-auto flex max-w-page items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-8">
              <span className="flex items-center gap-2 text-sm">
                {username && <span className="font-medium">{username}</span>}
                {role && <Badge tone={role === "ADMIN" ? "primary" : "neutral"}>{role}</Badge>}
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

// Standard page content wrapper; the skip link targets its id.
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={cn("mx-auto w-full max-w-page px-4 py-8 focus:outline-none sm:px-8 sm:py-10", className)}>
      {children}
    </main>
  );
}
