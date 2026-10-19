"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, errorMessage, ApiError } from "@/lib/api";
import { applyBranding } from "@/lib/branding";
import type { TenantPublic } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

const DEMO_ACCOUNTS = [
  { label: "Acme Corp", detail: "Enterprise · Owner", email: "owner@acme.test", slug: "acme" },
  { label: "Globex", detail: "Starter · Owner", email: "owner@globex.test", slug: "globex" },
];

export function LoginForm() {
  const router = useRouter();
  const { login, status, tenantSelection, clearTenantSelection } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostTenant, setHostTenant] = useState<TenantPublic | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
  }, [status, router]);

  /* Brand the login page when it is served from a tenant's custom domain. */
  useEffect(() => {
    const host = window.location.hostname;
    if (!host || host === "localhost" || /^\d+\./.test(host)) return;
    api
      .get<{ tenant: TenantPublic | null }>(`/public/tenants/resolve?host=${encodeURIComponent(host)}`)
      .then((res) => {
        if (res.tenant) {
          setHostTenant(res.tenant);
          applyBranding(res.tenant.branding);
        }
      })
      .catch(() => undefined);
  }, []);

  async function submit(nextEmail = email, nextPassword = password, slug?: string) {
    setLoading(true);
    setError(null);
    try {
      await login(nextEmail, nextPassword, slug);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TENANT_SELECTION_REQUIRED") {
        setError(null);
      } else {
        setError(errorMessage(err));
      }
      setLoading(false);
    }
  }

  async function pickWorkspace(slug: string) {
    await submit(email, password, slug);
  }

  if (tenantSelection) {
    return (
      <div className="animate-slide-up">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Choose a workspace</h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {email} belongs to {tenantSelection.tenants.length} workspaces.
        </p>
        <div className="mt-6 space-y-2">
          {tenantSelection.tenants.map((t) => (
            <button
              key={t.tenantId}
              onClick={() => pickWorkspace(t.slug)}
              disabled={loading}
              className="focus-brand group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-brand/40 hover:bg-muted/60 disabled:opacity-60"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
                <Building2 className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-foreground">{t.name}</span>
                <span className="block text-[12px] text-muted-foreground">
                  {t.slug} · {t.role.toLowerCase()}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            clearTenantSelection();
            setLoading(false);
          }}
          className="focus-brand mt-5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Use a different account
        </button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
        {hostTenant ? `Sign in to ${hostTenant.name}` : "Welcome back"}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        {hostTenant
          ? "Use your workspace credentials to continue."
          : "Sign in to your workspace to pick up where you left off."}
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Work email">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error ? (
          <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      <div className="mt-7">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Demo workspaces</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.slug}
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail(account.email);
                setPassword("Password123!");
                void submit(account.email, "Password123!", account.slug);
              }}
              className="focus-brand rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-muted/60 disabled:opacity-60"
            >
              <span className="block text-[12.5px] font-medium text-foreground">{account.label}</span>
              <span className="block text-[11.5px] text-muted-foreground">{account.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
          Password for demo accounts: <span className="font-mono">Password123!</span>
        </p>
      </div>

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="focus-brand font-medium text-brand-text hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
