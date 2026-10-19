"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { BillingOverview, FeatureKey, TenantMe } from "./types";

interface WorkspaceValue {
  me: TenantMe | null;
  billing: BillingOverview | null;
  /** Effective entitlements (plan merged with per-tenant overrides). */
  features: Record<FeatureKey, boolean>;
  overrides: Partial<Record<FeatureKey, boolean>>;
  loading: boolean;
  refresh: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const NO_FEATURES: Record<FeatureKey, boolean> = {
  analytics: false,
  custom_domain: false,
  audit_log: false,
  byok: false,
  white_label: false,
  sso: false,
  api_access: false,
  priority_support: false,
};

/**
 * Tenant admin + billing snapshot shared by the app shell and pages.
 * Refetched after plan changes, branding saves and feature overrides.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<TenantMe | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<TenantMe>("/tenants/me").catch(() => null),
      api.get<BillingOverview>("/billing").catch(() => null),
    ])
      .then(([meResult, billingResult]) => {
        if (cancelled) return;
        setMe(meResult);
        setBilling(billingResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      me,
      billing,
      features: billing?.plan.features ?? NO_FEATURES,
      overrides: billing?.plan.overrides ?? {},
      loading,
      refresh: () => setNonce((n) => n + 1),
    }),
    [me, billing, loading],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return ctx;
}
