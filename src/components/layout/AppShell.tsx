"use client";

import clsx from "clsx";
import { Boxes, GitCompareArrows, LayoutDashboard, LibraryBig, LogOut, ShieldCheck, SlidersHorizontal, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StationUrlSync } from "./StationUrlSync";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Обзор производства", short: "Обзор", icon: LayoutDashboard },
  { href: "/process", label: "Процесс", short: "Процесс", icon: Workflow },
  { href: "/scenarios", label: "Сценарии", short: "Сценарии", icon: SlidersHorizontal },
  { href: "/compare", label: "Сравнение", short: "Сравнение", icon: GitCompareArrows },
  { href: "/factory", label: "3D-тур", short: "3D-тур", icon: Boxes },
  { href: "/documentation", label: "Документация", short: "Справка", icon: LibraryBig },
];

/** Знак продукта: схематичный насос — корпус-улитка и вал, в квадрате с мягкими углами. */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1f66c9" />
      <circle cx="17.5" cy="16" r="6.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="17.5" cy="16" r="2" fill="#fff" />
      <path d="M17.5 9.5h6v3.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6.5 16h4.5" stroke="#9cc3f5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ user, children }: {
  user: { displayName: string; role: string; roleLabel: string }; children: ReactNode;
}) {
  const pathname = usePathname();
  const items: NavItem[] = user.role === "admin" ? [...NAV, { href: "/admin", label: "Администрирование", short: "Управление", icon: ShieldCheck }] : NAV;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = items.find((item) => isActive(item.href));
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  const initials = user.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <StationUrlSync />
      <aside className="app-sidebar sticky top-0 hidden h-dvh flex-col lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-5 pb-6 pt-6" aria-label="INDUSTRIA TWIN">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-[0.04em] text-white">INDUSTRIA TWIN</span>
            <span className="rail-muted block text-[12px]">Цифровой двойник цеха</span>
          </span>
        </Link>
        <div className="mx-5 mb-5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-3">
          <div className="text-[13px] font-medium text-white">Сборка центробежных насосов</div>
          <div className="rail-muted mt-0.5 text-[12px]">Условный цех, синтетические данные</div>
        </div>
        <nav aria-label="Основная навигация" className="flex-1 space-y-0.5 px-3">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className="app-nav-link flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors">
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mx-3 mb-4 flex items-center gap-3 rounded-lg border border-white/10 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f66c9] text-[12px] font-semibold text-white">{initials}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] text-white">{user.displayName}</span>
            <span className="rail-muted block text-[12px]">{user.roleLabel}</span>
          </span>
          <button onClick={logout} className="rail-muted rounded-md p-1.5 hover:bg-white/10 hover:text-white" aria-label="Выйти" title="Выйти">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold lg:hidden"><BrandMark />INDUSTRIA TWIN</Link>
          <div className="hidden items-center gap-2 text-[13px] text-muted lg:flex">
            <span>Цех сборки насосов</span>
            <span className="text-line-strong">/</span>
            <span className="font-medium text-ink">{current?.label ?? "Цифровая модель"}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[12px] text-muted">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />Демонстрационная среда
            </span>
            <button onClick={logout} className="underline underline-offset-4 lg:hidden">Выйти</button>
          </div>
        </header>
        <main className="app-main min-w-0 px-4 pb-24 pt-7 sm:px-7 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <nav aria-label="Навигация" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        {NAV.map(({ href, label, short, icon: Icon }) => {
          const active = isActive(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={label}
            className={clsx("flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px]", active ? "text-accent" : "text-muted")}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />{short}
          </Link>;
        })}
      </nav>
    </div>
  );
}
