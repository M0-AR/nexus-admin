"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Check, Menu, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { useClickOutside } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import type { NotificationsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLES: Array<[string, string]> = [
  ["/dashboard", "Overview"],
  ["/orders", "Orders"],
  ["/products", "Products"],
  ["/users", "Team"],
  ["/audit", "Audit log"],
  ["/settings", "Settings"],
];

function pageTitle(pathname: string): string {
  const match = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match?.[1] ?? "Nexus Admin";
}

export function Topbar({
  onOpenMobile,
  onOpenPalette,
}: {
  onOpenMobile: () => void;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        onClick={onOpenMobile}
        className="focus-brand -ml-1 inline-flex size-8.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{pageTitle(pathname)}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={onOpenPalette}
          className="focus-brand hidden h-8.5 w-60 items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-muted/70 hover:text-foreground sm:flex"
        >
          <Search className="size-3.5" />
          <span className="flex-1 truncate text-left">Search…</span>
          <kbd className="rounded border border-border bg-card px-1.5 py-px text-[10.5px] font-medium">⌘K</kbd>
        </button>
        <NotificationsPopover />
        <ThemeToggle />
        <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
}

function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { data, setData } = useApi<NotificationsResponse>("/notifications");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const unread = data?.unread ?? 0;

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`).catch(() => undefined);
    setData((prev) =>
      prev
        ? {
            unread: Math.max(0, prev.unread - (prev.items.find((n) => n.id === id && !n.read) ? 1 : 0)),
            items: prev.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
          }
        : prev,
    );
  }

  async function markAll() {
    await api.post("/notifications/read-all").catch(() => undefined);
    setData((prev) => (prev ? { unread: 0, items: prev.items.map((n) => ({ ...n, read: true })) } : prev));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="focus-brand relative inline-flex size-8.5 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="sr-only">
          Notifications{unread > 0 ? `, ${unread} unread` : ""}
        </span>
        <Bell aria-hidden className="size-4.5" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-brand-strong px-1 text-[9.5px] leading-4 font-semibold text-brand-foreground">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-in absolute right-0 z-40 mt-1.5 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[13px] font-semibold text-foreground">Notifications</span>
            {unread > 0 ? (
              <button
                onClick={markAll}
                className="focus-brand inline-flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline"
              >
                <Check className="size-3" /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {!data ? (
              <div className="p-4 text-center text-[12.5px] text-muted-foreground">Loading…</div>
            ) : data.items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto size-5 text-muted-foreground/60" />
                <p className="mt-2 text-[13px] text-muted-foreground">You're all caught up.</p>
              </div>
            ) : (
              data.items.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                    !n.read && "bg-brand-soft/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-brand",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{n.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
