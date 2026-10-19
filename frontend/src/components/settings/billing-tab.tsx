"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Crown, Sparkles, Zap } from "lucide-react";
import type { FeatureKey, PlanInfo, PlanTier } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Meter } from "@/components/ui/meter";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export function BillingTab() {
  const { role, updatePlan } = useAuth();
  const { billing, loading, refresh } = useWorkspace();
  const { success, error: errorToast } = useToast();

  const [switching, setSwitching] = useState<PlanTier | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanInfo | null>(null);
  const [overriding, setOverriding] = useState<FeatureKey | null>(null);

  const canSwitch = role === "OWNER";
  const canOverride = role === "OWNER" || role === "ADMIN";

  if (loading && !billing) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[180px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <p className="text-[13.5px] text-muted-foreground">Billing information is unavailable right now.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }

  const { plan, seats, usage, plans, featureMeta, period, subscription } = billing;
  const apiCallLimit = plan.requestsPerMinute * 60 * 24 * 30;

  const planDelta = pendingPlan
    ? (() => {
        const gained = featureMeta.filter((f) => pendingPlan.features[f.key] && !plan.features[f.key]);
        const lost = featureMeta.filter((f) => !pendingPlan.features[f.key] && plan.features[f.key]);
        const orderCapDrops = pendingPlan.limits.ordersPerMonth < plan.limits.ordersPerMonth;
        const productCapDrops = pendingPlan.limits.products < plan.limits.products;
        const seatCapDrops = (pendingPlan.seats ?? 0) < seats.used;
        return { gained, lost, orderCapDrops, productCapDrops, seatCapDrops };
      })()
    : null;

  const switchDescription = (() => {
    if (!pendingPlan || !planDelta) return "";
    const parts: string[] = [];
    if (pendingPlan.priceMonthly !== null && plan.priceMonthly !== null) {
      const diff = pendingPlan.priceMonthly - plan.priceMonthly;
      if (diff !== 0) {
        parts.push(`${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}/mo from your next invoice`);
      }
    }
    if (planDelta.lost.length > 0) {
      parts.push(`you will lose ${planDelta.lost.map((f) => f.label).join(", ")}`);
    }
    if (planDelta.gained.length > 0) {
      parts.push(`you will gain ${planDelta.gained.map((f) => f.label).join(", ")}`);
    }
    if (planDelta.seatCapDrops) {
      parts.push(`your current ${seats.used} seats exceed the new limit of ${pendingPlan.seats}`);
    }
    if (planDelta.orderCapDrops) {
      parts.push(`the order cap drops to ${formatNumber(pendingPlan.limits.ordersPerMonth)}/mo`);
    }
    if (planDelta.productCapDrops) {
      parts.push(`the product cap drops to ${formatNumber(pendingPlan.limits.products)}`);
    }
    if (parts.length === 0) parts.push("no feature or limit changes apply to this workspace");
    return `You are switching from ${plan.name} to ${pendingPlan.name}: ${parts.join("; ")}. This demo applies plan changes immediately without payment.`;
  })();

  const switchPlan = async (tier: PlanTier) => {
    if (!canSwitch || tier === plan.tier) return;
    setSwitching(tier);
    try {
      await api.post("/billing/plan", { plan: tier });
      updatePlan(tier);
      success(`Switched to ${tier.charAt(0) + tier.slice(1).toLowerCase()}`);
      setPendingPlan(null);
      refresh();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setSwitching(null);
    }
  };

  const toggleOverride = async (feature: FeatureKey, enabled: boolean) => {
    setOverriding(feature);
    try {
      await api.post("/billing/features", { feature, enabled });
      success(`${enabled ? "Enabled" : "Disabled"} ${feature.replace(/_/g, " ")} for this workspace`);
      refresh();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setOverriding(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)] xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
                <Crown className="size-4 text-muted-foreground" /> Current plan
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] font-semibold tracking-tight text-foreground">{plan.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {plan.priceMonthly === null ? "custom pricing" : `${formatCurrency(plan.priceMonthly)}/mo`}
                </span>
              </div>
              {subscription ? (
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Current period {new Date(period.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
                  {new Date(period.end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
            <Badge tone="brand">{plan.tier}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2">
            <Meter value={seats.used} max={seats.limit} label="Seats" suffix={`${seats.used}/${seats.limit}`} />
            <Meter
              value={usage.orders.total}
              max={usage.limits.ordersPerMonth}
              label="Orders this period"
              suffix={`${formatNumber(usage.orders.total)}/${formatNumber(usage.limits.ordersPerMonth)}`}
            />
            <Meter
              value={usage.visits.total}
              max={Math.max(usage.visits.total, 1)}
              label="Tracked visits"
              suffix={formatNumber(usage.visits.total)}
              tone="brand"
            />
            <Meter
              value={usage.api_calls.total}
              max={apiCallLimit}
              label="API calls"
              suffix={`${formatNumber(usage.api_calls.total)} · ${plan.requestsPerMinute}/min`}
            />
          </div>
        </div>

        <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-5 py-4">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
              <Zap className="size-4 text-muted-foreground" /> Included features
            </h3>
          </div>
          <ul className="space-y-2.5 px-5 py-5">
            {featureMeta.map((feature) => {
              const enabled = plan.features[feature.key];
              const overridden = plan.overrides ? feature.key in plan.overrides : false;
              return (
                <li key={feature.key} className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
                      enabled ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[13px] font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                        {feature.label}
                      </span>
                      {overridden ? (
                        <span className="rounded bg-brand-soft px-1 py-px text-[10px] font-semibold text-brand-text">override</span>
                      ) : null}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">{feature.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Plans</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {canSwitch ? "Switch instantly — this demo provisions plans without payment." : "Only the workspace owner can change plans."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((option) => {
            const current = option.tier === plan.tier;
            return (
              <div
                key={option.tier}
                className={`card-sheen flex flex-col rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors ${
                  current ? "border-brand/60 ring-1 ring-brand/30" : "border-border hover:border-brand/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                    {option.tier === "ENTERPRISE" ? <Sparkles className="size-4 text-brand-text" /> : null}
                    {option.name}
                  </span>
                  {current ? <Badge tone="brand">Current</Badge> : null}
                </div>
                <p className="mt-2 text-[20px] font-semibold tracking-tight text-foreground">
                  {option.priceMonthly === null ? "Custom" : formatCurrency(option.priceMonthly)}
                  {option.priceMonthly !== null ? <span className="text-[12.5px] font-normal text-muted-foreground">/mo</span> : null}
                </p>
                <ul className="mt-3 flex-1 space-y-1.5">
                  <li className="text-[12.5px] text-muted-foreground">{option.seats && option.seats >= 9999 ? "Unlimited seats" : `${option.seats ?? "—"} seats`}</li>
                  <li className="text-[12.5px] text-muted-foreground">{formatNumber(option.limits.ordersPerMonth)} orders/mo</li>
                  <li className="text-[12.5px] text-muted-foreground">{formatNumber(option.limits.products)} products</li>
                  <li className="text-[12.5px] text-muted-foreground">{formatNumber(option.requestsPerMinute)} API req/min</li>
                </ul>
                <div className="mt-4">
                  {current ? (
                    <Button variant="secondary" size="sm" className="w-full" disabled>
                      Active
                    </Button>
                  ) : option.tier === "ENTERPRISE" ? (
                    <a href="mailto:sales@nexus-admin.dev?subject=Enterprise%20plan" className="block">
                      <Button variant="outline" size="sm" className="w-full">
                        Contact sales <ArrowUpRight className="size-3.5" />
                      </Button>
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!canSwitch}
                      loading={switching === option.tier}
                      onClick={() => setPendingPlan(option)}
                    >
                      Switch to {option.name}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Feature overrides</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {canOverride
              ? "Grant or revoke individual capabilities for this workspace, regardless of plan."
              : "Only owners and admins can manage overrides."}
          </p>
        </div>
        <ul className="divide-y divide-border/70">
          {featureMeta.map((feature) => {
            const planValue = plan.features[feature.key];
            const override = plan.overrides?.[feature.key];
            const effective = override ?? planValue;
            return (
              <li key={feature.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                    {feature.label}
                    {override !== undefined ? (
                      <span className="rounded bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand-text">
                        override · plan default {planValue ? "on" : "off"}
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
                        from plan
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{feature.description}</p>
                </div>
                <Switch
                  checked={effective}
                  disabled={!canOverride || overriding === feature.key}
                  onChange={(next) => toggleOverride(feature.key, next)}
                  label={feature.label}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={pendingPlan !== null}
        onClose={() => setPendingPlan(null)}
        onConfirm={() => pendingPlan && switchPlan(pendingPlan.tier)}
        title={pendingPlan ? `Switch to ${pendingPlan.name}?` : "Switch plan?"}
        description={switchDescription}
        confirmLabel={pendingPlan ? `Switch to ${pendingPlan.name}` : "Switch plan"}
        loading={switching !== null}
      />
    </div>
  );
}
