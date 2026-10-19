"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Building2, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type MenuItem } from "@/components/ui/dropdown";
import { Badge, ROLE_TONE } from "@/components/ui/badge";
import { errorMessage } from "@/lib/api";

export function UserMenu() {
  const router = useRouter();
  const { user, tenant, role, memberships, logout, switchTenant } = useAuth();
  const { billing } = useWorkspace();
  const { setTheme, resolvedTheme } = useTheme();
  const toast = useToast();

  if (!user) return null;

  async function handleSwitch(slug: string) {
    if (slug === tenant?.slug) return;
    try {
      await switchTenant(slug);
      toast.success("Workspace switched");
      router.push("/dashboard");
    } catch (err) {
      toast.error("Could not switch workspace", errorMessage(err));
    }
  }

  const items: MenuItem[] = [];

  for (const m of memberships) {
    items.push({
      label: `${m.name} · ${m.role.toLowerCase()}`,
      icon: <Building2 />,
      checked: m.slug === tenant?.slug,
      onSelect: () => void handleSwitch(m.slug),
    });
  }

  if (memberships.length > 0) items.push({ separator: true });

  items.push({
    label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
    icon: resolvedTheme === "dark" ? <Sun /> : <Moon />,
    onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  });
  items.push({ separator: true });
  items.push({
    label: "Sign out",
    icon: <LogOut />,
    danger: true,
    onSelect: () => {
      void logout().then(() => router.replace("/login"));
    },
  });

  return (
    <DropdownMenu
      align="end"
      menuClassName="w-64"
      items={items}
      trigger={
        <button className="focus-brand flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-muted">
          <span className="sr-only">Account menu</span>
          <Avatar name={user.name} color={user.avatarColor} size="sm" />
          <span className="hidden min-w-0 flex-col items-start md:flex">
            <span className="max-w-[130px] truncate text-[13px] leading-tight font-medium text-foreground">
              {user.name}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="max-w-[110px] truncate text-[11px] leading-tight text-muted-foreground">
                {billing?.plan.name ?? tenant?.plan ?? ""}
              </span>
              {role ? (
                <Badge tone={ROLE_TONE[role] ?? "neutral"} className="px-1.5 py-0 text-[9.5px] leading-3.5">
                  {role}
                </Badge>
              ) : null}
            </span>
          </span>
        </button>
      }
    />
  );
}
