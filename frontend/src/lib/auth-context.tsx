"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, refreshAccessToken, setAccessToken, setSessionLostHandler, ApiError } from "./api";
import { applyBranding, resetBranding } from "./branding";
import type { AuthBundle, MembershipRole, PlanTier, TenantBranding } from "./types";

type Status = "loading" | "authed" | "anon";

interface TenantSelection {
  tenants: Array<{ tenantId: string; slug: string; name: string; role: MembershipRole }>;
}

interface AuthContextValue {
  status: Status;
  bundle: AuthBundle | null;
  user: AuthBundle["user"] | null;
  tenant: AuthBundle["tenant"] | null;
  role: MembershipRole | null;
  memberships: AuthBundle["memberships"];
  /** Set when login returned TENANT_SELECTION_REQUIRED (multi-workspace account). */
  tenantSelection: TenantSelection | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<AuthBundle>;
  signup: (data: {
    companyName: string;
    name: string;
    email: string;
    password: string;
    region?: string;
  }) => Promise<AuthBundle>;
  logout: () => Promise<void>;
  switchTenant: (slug: string) => Promise<void>;
  clearTenantSelection: () => void;
  updateBranding: (branding: TenantBranding, name?: string) => void;
  updatePlan: (plan: PlanTier) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [bundle, setBundle] = useState<AuthBundle | null>(null);
  const [tenantSelection, setTenantSelection] = useState<TenantSelection | null>(null);
  const bootstrapped = useRef(false);

  const adopt = useCallback((next: AuthBundle) => {
    setAccessToken(next.accessToken);
    setBundle(next);
    applyBranding(next.tenant.branding);
    setTenantSelection(null);
    setStatus("authed");
  }, []);

  /* Restore the session from the httpOnly refresh cookie on first paint. */
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    setSessionLostHandler(() => {
      setAccessToken(null);
      setBundle(null);
      resetBranding();
      setStatus("anon");
    });

    (async () => {
      try {
        const restored = await api.post<AuthBundle>("/auth/refresh", undefined, { raw: true });
        adopt(restored);
      } catch {
        setStatus("anon");
      }
    })();

    return () => setSessionLostHandler(null);
  }, [adopt]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string): Promise<AuthBundle> => {
      try {
        const next = await api.post<AuthBundle>(
          "/auth/login",
          { email, password, ...(tenantSlug ? { tenantSlug } : {}) },
          { raw: true },
        );
        adopt(next);
        return next;
      } catch (err) {
        if (err instanceof ApiError && err.code === "TENANT_SELECTION_REQUIRED") {
          const details = err.details as { tenants?: TenantSelection["tenants"] } | undefined;
          setTenantSelection({ tenants: details?.tenants ?? [] });
        }
        throw err;
      }
    },
    [adopt],
  );

  const signup = useCallback(
    async (data: { companyName: string; name: string; email: string; password: string; region?: string }) => {
      const next = await api.post<AuthBundle>("/auth/signup", data, { raw: true });
      adopt(next);
      return next;
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", undefined, { raw: true });
    } catch {
      /* best-effort server-side revoke */
    }
    setAccessToken(null);
    setBundle(null);
    resetBranding();
    setStatus("anon");
  }, []);

  const switchTenant = useCallback(
    async (slug: string) => {
      const next = await api.post<AuthBundle>("/auth/switch", { tenantSlug: slug });
      adopt(next);
    },
    [adopt],
  );

  const updateBranding = useCallback((branding: TenantBranding, name?: string) => {
    setBundle((prev) => {
      if (!prev) return prev;
      applyBranding(branding);
      return { ...prev, tenant: { ...prev.tenant, branding, ...(name ? { name } : {}) } };
    });
  }, []);

  const updatePlan = useCallback((plan: PlanTier) => {
    setBundle((prev) => (prev ? { ...prev, tenant: { ...prev.tenant, plan } } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      bundle,
      user: bundle?.user ?? null,
      tenant: bundle?.tenant ?? null,
      role: bundle?.role ?? null,
      memberships: bundle?.memberships ?? [],
      tenantSelection,
      login,
      signup,
      logout,
      switchTenant,
      clearTenantSelection: () => setTenantSelection(null),
      updateBranding,
      updatePlan,
    }),
    [status, bundle, tenantSelection, login, signup, logout, switchTenant, updateBranding, updatePlan],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export { refreshAccessToken };
