"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: "audit_log";
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/users", label: "Team", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText, feature: "audit_log" },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useVisibleNav(): NavItem[] {
  const { features } = useWorkspace();
  return NAV_ITEMS.filter((item) => !item.feature || features[item.feature]);
}

function BrandHeader({ collapsed }: { collapsed: boolean }) {
  const { tenant } = useAuth();
  const branding = tenant?.branding;
  return (
    <div className={cn("flex items-center gap-2.5 px-3.5", collapsed ? "justify-center px-2" : "")}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]">
        {branding?.faviconEmoji ? (
          <span className="text-[15px]">{branding.faviconEmoji}</span>
        ) : (
          (branding?.logoText ?? tenant?.name ?? "N").slice(0, 2).toUpperCase()
        )}
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold tracking-tight text-foreground">
            {tenant?.name ?? "Workspace"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{tenant?.slug ?? ""}</span>
        </span>
      ) : null}
    </div>
  );
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useVisibleNav();

  return (
    <nav className="flex flex-col gap-0.5 px-2.5">
      {items.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) || (item.href === "/dashboard" && pathname === "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "focus-brand group flex items-center gap-3 rounded-lg py-2 text-[13.5px] font-medium transition-colors duration-150",
              collapsed ? "justify-center px-0" : "px-3",
              active
                ? "bg-brand-soft text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4.5 shrink-0", active && "text-brand-text")} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function PlanCard({ collapsed }: { collapsed: boolean }) {
  const { tenant } = useAuth();
  const { billing } = useWorkspace();
  const tier = billing?.plan.tier ?? tenant?.plan ?? "FREE";
  const name = billing?.plan.name ?? tier;

  if (collapsed) {
    return (
      <div className="flex justify-center pb-1" title={`${name} plan`}>
        <Sparkles className="size-4 text-brand-text" />
      </div>
    );
  }

  return (
    <div className="mx-2.5 rounded-xl border border-border bg-gradient-to-b from-brand-soft/50 to-card p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
          <Sparkles className="size-3.5 text-brand-text" />
          {name} plan
        </span>
        <Badge tone={tier === "ENTERPRISE" ? "brand" : "neutral"} className="text-[10.5px]">
          {tier}
        </Badge>
      </div>
      {tier !== "ENTERPRISE" ? (
        <>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            Audit logs, SSO &amp; white-labeling.
          </p>
          <Link
            href="/settings?tab=billing"
            className="focus-brand mt-2.5 flex h-7.5 items-center justify-center rounded-md bg-brand text-[12.5px] font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            Upgrade plan
          </Link>
        </>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">Everything&apos;s unlocked.</p>
      )}
    </div>
  );
}

/** Desktop sidebar — fixed, collapsible. */
export function AppSidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-background transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      <div className="flex h-14 items-center">
        <BrandHeader collapsed={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <NavLinks collapsed={collapsed} />
      </div>
      <div className="space-y-2 py-3">
        <PlanCard collapsed={collapsed} />
        <div className={cn("flex", collapsed ? "justify-center" : "justify-end px-2.5")}>
          <button
            onClick={onToggleCollapsed}
            className="focus-brand inline-flex size-7.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Mobile overlay drawer. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="animate-fade-in absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-slide-up absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border bg-background shadow-[var(--shadow-pop)]">
        <div className="flex h-14 items-center justify-between pr-2.5">
          <BrandHeader collapsed={false} />
          <button
            onClick={onClose}
            className="focus-brand inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks collapsed={false} onNavigate={onClose} />
        </div>
        <div className="py-3">
          <PlanCard collapsed={false} />
        </div>
      </div>
    </div>
  );
}
