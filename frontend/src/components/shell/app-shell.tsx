"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { AppSidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { LogoWordmark } from "@/components/brand/logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("nexus.sidebar.collapsed");
      if (stored === "1") setCollapsed(true);
    } catch {
      /* private mode */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("nexus.sidebar.collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding-left] duration-200 ease-out",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Full-screen brand splash shown while the session is being restored. */
export function SessionSplash() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      {visible ? (
        <div className="animate-fade-in flex flex-col items-center gap-4">
          <LogoWordmark />
          <span className="flex size-5 items-center justify-center">
            <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-brand" />
          </span>
          <p className="text-[12.5px] text-muted-foreground">Restoring your session…</p>
        </div>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
