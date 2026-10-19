"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: "Navigate" | "Actions" | "Workspaces";
  icon: React.ReactNode;
  keywords?: string;
  action: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { memberships, tenant, switchTenant, logout } = useAuth();
  const { features } = useWorkspace();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const list: Command[] = [
      { id: "nav-dashboard", label: "Dashboard", group: "Navigate", icon: <LayoutDashboard />, action: go("/dashboard") },
      { id: "nav-orders", label: "Orders", group: "Navigate", icon: <ShoppingCart />, action: go("/orders") },
      { id: "nav-products", label: "Products", group: "Navigate", icon: <Package />, action: go("/products") },
      { id: "nav-users", label: "Team", group: "Navigate", icon: <Users />, action: go("/users") },
      { id: "nav-settings", label: "Settings", group: "Navigate", icon: <Settings />, action: go("/settings") },
      { id: "act-new-order", label: "Create order", group: "Actions", icon: <Plus />, keywords: "new add sale", action: go("/orders?new=1") },
      { id: "act-new-product", label: "Create product", group: "Actions", icon: <Plus />, keywords: "new add sku", action: go("/products?new=1") },
      { id: "act-invite", label: "Invite teammate", group: "Actions", icon: <UserPlus />, keywords: "member user add", action: go("/users?invite=1") },
      {
        id: "act-theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Actions",
        icon: resolvedTheme === "dark" ? <Sun /> : <Moon />,
        keywords: "dark light mode",
        action: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "act-logout",
        label: "Sign out",
        group: "Actions",
        icon: <LogOut />,
        action: () => void logout().then(() => router.push("/login")),
      },
    ];

    if (features.audit_log) {
      list.splice(4, 0, {
        id: "nav-audit",
        label: "Audit log",
        group: "Navigate",
        icon: <ScrollText />,
        action: go("/audit"),
      });
    }

    for (const m of memberships) {
      if (m.slug === tenant?.slug) continue;
      list.push({
        id: `ws-${m.slug}`,
        label: `Switch to ${m.name}`,
        group: "Workspaces",
        icon: <Building2 />,
        action: () => void switchTenant(m.slug).then(() => router.push("/dashboard")),
      });
    }
    return list;
  }, [router, memberships, tenant, switchTenant, logout, features.audit_log, resolvedTheme, setTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const groups = useMemo(() => {
    const order: Command["group"][] = ["Navigate", "Actions", "Workspaces"];
    return order
      .map((group) => ({ group, items: filtered.filter((c) => c.group === group) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    onClose();
    command.action();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(flat[active]);
    }
  }

  let index = -1;

  return (
    <Dialog open={open} onClose={onClose} size="lg" className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search pages and actions…"
          className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          ESC
        </kbd>
      </div>
      <div ref={listRef} className="max-h-[380px] overflow-y-auto p-1.5">
        {flat.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No results for “{query}”</p>
        ) : (
          groups.map((group) => (
            <div key={group.group} className="mb-1 last:mb-0">
              <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.group}
              </p>
              {group.items.map((command) => {
                index += 1;
                const itemIndex = index;
                return (
                  <button
                    key={command.id}
                    data-index={itemIndex}
                    onMouseEnter={() => setActive(itemIndex)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
                      itemIndex === active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span className="[&>svg]:size-4 [&>svg]:text-muted-foreground">{command.icon}</span>
                    <span className="flex-1 truncate">{command.label}</span>
                    {itemIndex === active ? (
                      <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">
                        ↵
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}
