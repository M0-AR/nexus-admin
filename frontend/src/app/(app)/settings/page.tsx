"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Palette, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandingTab } from "@/components/settings/branding-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { SecurityTab } from "@/components/settings/security-tab";

const TABS = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "billing", label: "Billing & features", icon: CreditCard },
  { id: "security", label: "Security & domain", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(value: string | null): value is TabId {
  return value !== null && TABS.some((tab) => tab.id === value);
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsView />
    </Suspense>
  );
}

function SettingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(isTab(initial) ? initial : "branding");

  useEffect(() => {
    const next = searchParams.get("tab");
    if (isTab(next)) setTab(next);
  }, [searchParams]);

  const select = (next: TabId) => {
    setTab(next);
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">
        Branding, billing and security for this workspace.
      </p>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-card)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => select(id)}
            className={cn(
              "focus-brand inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              tab === id
                ? "bg-brand-soft text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon className={cn("size-4", tab === id && "text-brand-text")} />
            {label}
          </button>
        ))}
      </div>

      {tab === "branding" ? <BrandingTab /> : null}
      {tab === "billing" ? <BillingTab /> : null}
      {tab === "security" ? <SecurityTab /> : null}
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}
