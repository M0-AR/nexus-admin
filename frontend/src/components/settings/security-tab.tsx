"use client";

import { useState } from "react";
import { Check, Copy, Database, Globe, KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { DomainResponse, RotateSecretResponse, SecretItem } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Table, TBody, TH, THead, TR, TD } from "@/components/ui/table";

export function SecurityTab() {
  const { role } = useAuth();
  const { me, loading, refresh } = useWorkspace();

  if (loading && !me) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[220px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DomainCard canManage={role === "OWNER" || role === "ADMIN"} />
      <SecretsCard canRotate={role === "OWNER"} canView={role === "OWNER" || role === "ADMIN"} />
      <IsolationCard
        canManage={role === "OWNER"}
        isEnterprise={me?.plan === "ENTERPRISE"}
        isolationMode={me?.isolationMode ?? "SHARED"}
        dedicatedUrl={me?.dedicatedDatabaseUrl ?? null}
        dataRegion={me?.dataRegion ?? "us-east-1"}
        onChanged={refresh}
      />
    </div>
  );
}

function FeatureGate({ title, featureLabel }: { title: string; featureLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-4.5" />
      </span>
      <p className="mt-3 text-[14px] font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
        {featureLabel} is not enabled for this workspace. Upgrade the plan or ask an owner to grant a feature override.
      </p>
      <a href="/settings?tab=billing" className="mt-4">
        <Button size="sm" variant="outline">
          View plans
        </Button>
      </a>
    </div>
  );
}

function DomainCard({ canManage }: { canManage: boolean }) {
  const { me, features, refresh } = useWorkspace();
  const { success, error: errorToast } = useToast();
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [setup, setSetup] = useState<DomainResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  if (!features.custom_domain) {
    return <FeatureGate title="Custom domain" featureLabel="Custom domain" />;
  }

  const addDomain = async () => {
    if (!canManage) return;
    setAdding(true);
    setVerifyError(null);
    try {
      const result = await api.post<DomainResponse>("/settings/domain", { domain: domain.trim() });
      setSetup(result);
      if (result.verified) {
        success(`${result.domain} is verified`);
        refresh();
      }
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.post<{ verified: boolean; domain?: string; message?: string; found?: string[] }>(
        "/settings/domain/verify",
      );
      if (result.verified) {
        success(`${result.domain ?? "Domain"} verified`);
        setSetup(null);
        refresh();
      } else {
        setVerifyError(result.message ?? "DNS record not found yet — allow up to a few minutes for propagation.");
      }
    } catch (err) {
      setVerifyError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            <Globe className="size-4 text-muted-foreground" /> Custom domain
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Serve this workspace from your own domain with automatic branding.
          </p>
        </div>
        {me?.customDomain ? (
          <Badge tone={me.customDomainVerified ? "success" : "warning"} dot>
            {me.customDomainVerified ? "Verified" : "Pending verification"}
          </Badge>
        ) : null}
      </div>
      <div className="space-y-4 px-5 py-5">
        {me?.customDomain ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <span className="text-[13.5px] font-medium text-foreground">{me.customDomain}</span>
            {me.customDomainVerified ? (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-success">
                <ShieldCheck className="size-3.5" /> DNS verified
              </span>
            ) : (
              <span className="text-[12.5px] text-warning">Waiting for DNS record</span>
            )}
            {canManage ? (
              <Button size="sm" variant="outline" className="ml-auto" onClick={verify} loading={verifying}>
                Re-check DNS
              </Button>
            ) : null}
          </div>
        ) : null}

        {(!me?.customDomain || !me.customDomainVerified) && canManage ? (
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={me?.customDomain ? "Replace domain" : "Add a domain"} hint="Example: admin.yourcompany.com">
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="admin.yourcompany.com"
              />
            </Field>
            <Button size="sm" onClick={addDomain} loading={adding} disabled={!domain.trim()}>
              Save domain
            </Button>
          </div>
        ) : null}

        {setup ? (
          <div className="rounded-lg border border-brand/30 bg-brand-soft/40 px-4 py-3.5">
            <p className="text-[13px] font-medium text-foreground">DNS setup instructions</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{setup.instructions}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="tabular rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[12px] text-foreground">
                nexus-verify={setup.verificationToken}
              </code>
              <Button size="sm" variant="outline" onClick={verify} loading={verifying}>
                Verify now
              </Button>
            </div>
            {verifyError ? <p className="mt-2 text-[12.5px] text-danger">{verifyError}</p> : null}
          </div>
        ) : null}

        {!canManage ? (
          <p className="text-[12.5px] text-muted-foreground">Only owners and admins can manage the custom domain.</p>
        ) : null}
      </div>
    </div>
  );
}

function SecretsCard({ canRotate, canView }: { canRotate: boolean; canView: boolean }) {
  const { features, refresh } = useWorkspace();
  const { success, error: errorToast } = useToast();
  const [rotated, setRotated] = useState<RotateSecretResponse | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

  const enabled = features.byok && canView;
  const { data, loading, error, reload } = useApi<{ items: SecretItem[] }>(
    enabled ? "/settings/secrets" : null,
  );

  if (!features.byok) {
    return <FeatureGate title="Bring your own keys" featureLabel="BYOK secret storage" />;
  }

  const rotate = async (key: string) => {
    setRotating(key);
    try {
      const result = await api.post<RotateSecretResponse>("/settings/secrets/rotate", { key });
      setRotated(result);
      reload();
      refresh();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setRotating(null);
    }
  };

  return (
    <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            <KeyRound className="size-4 text-muted-foreground" /> Workspace secrets
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Encrypted at rest with a per-workspace data key (AES-256-GCM envelope encryption).
          </p>
        </div>
      </div>

      {!canView ? (
        <p className="px-5 py-5 text-[12.5px] text-muted-foreground">
          Only owners and admins can view workspace secrets.
        </p>
      ) : loading && !data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-muted-foreground">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH>Value</TH>
              <TH className="hidden md:table-cell">Last rotated</TH>
              <TH className="w-28" />
            </TR>
          </THead>
          <TBody>
            {(data?.items ?? []).length === 0 ? (
              <TR>
                <TD colSpan={4} className="py-8 text-center text-[13px] text-muted-foreground">
                  No secrets stored yet — rotated webhook secrets appear here.
                </TD>
              </TR>
            ) : (
              (data?.items ?? []).map((secret) => (
                <TR key={secret.key}>
                  <TD className="font-medium text-foreground">{secret.key}</TD>
                  <TD className="tabular font-mono text-[12.5px] text-muted-foreground">{secret.maskedValue}</TD>
                  <TD className="hidden text-muted-foreground md:table-cell">{formatDateTime(secret.rotatedAt)}</TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canRotate || rotating !== null}
                      loading={rotating === secret.key}
                      onClick={() => rotate(secret.key)}
                      title={canRotate ? undefined : "Only owners can rotate secrets"}
                    >
                      Rotate
                    </Button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}

      <Dialog open={rotated !== null} onClose={() => setRotated(null)} size="sm">
        <DialogHeader
          title="Secret rotated"
          description="Copy the new value now — it will never be shown again. Update your integrations before dismissing."
          onClose={() => setRotated(null)}
        />
        <DialogBody className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
            <p className="text-[12px] font-medium text-muted-foreground">{rotated?.key}</p>
            <p className="tabular mt-1 break-all font-mono text-[13px] font-medium text-foreground">{rotated?.value}</p>
          </div>
          <p className="text-[12.5px] text-muted-foreground">{rotated?.note}</p>
        </DialogBody>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (rotated) {
                try {
                  await navigator.clipboard.writeText(rotated.value);
                  success("Copied to clipboard");
                } catch {
                  errorToast("Copy failed — select the value manually");
                }
              }
            }}
          >
            <Copy className="size-4" /> Copy value
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function IsolationCard({
  canManage,
  isEnterprise,
  isolationMode,
  dedicatedUrl,
  dataRegion,
  onChanged,
}: {
  canManage: boolean;
  isEnterprise: boolean;
  isolationMode: "SHARED" | "DEDICATED";
  dedicatedUrl: string | null;
  dataRegion: string;
  onChanged: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const goDedicated = async () => {
    setSaving(true);
    try {
      await api.post("/tenants/me/isolation", { mode: "DEDICATED", dedicatedDatabaseUrl: url.trim() });
      success("This workspace now routes to its dedicated database");
      onChanged();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const goShared = async () => {
    setSaving(true);
    try {
      await api.post("/tenants/me/isolation", { mode: "SHARED" });
      success("Workspace returned to the shared pool");
      onChanged();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            <Database className="size-4 text-muted-foreground" /> Data isolation
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Shared pool with row-level security, or a dedicated database for maximum isolation.
          </p>
        </div>
        <Badge tone={isolationMode === "DEDICATED" ? "success" : "neutral"} dot>
          {isolationMode === "DEDICATED" ? "Dedicated database" : "Shared pool (RLS)"}
        </Badge>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]">
          <span className="text-muted-foreground">
            Region: <span className="font-medium text-foreground">{dataRegion}</span>
          </span>
          {isolationMode === "DEDICATED" && dedicatedUrl ? (
            <span className="text-muted-foreground">
              Connection: <span className="font-mono text-[12px] text-foreground">{dedicatedUrl.replace(/:\/\/[^@]+@/, "://***@")}</span>
            </span>
          ) : null}
        </div>

        {isolationMode === "SHARED" ? (
          isEnterprise ? (
            canManage ? (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
                <Field
                  label="Dedicated database URL"
                  hint="See the isolation runbook in the README — data migration is an ops step."
                >
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="postgresql://user:pass@host:5432/nexus_tenant"
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Button size="sm" onClick={goDedicated} loading={saving} disabled={!/^postgres(ql)?:\/\//.test(url.trim())}>
                  Move to dedicated
                </Button>
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Only the workspace owner can change isolation.</p>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Lock className="size-3.5" /> Dedicated databases are available on the Enterprise plan.
              </span>
              <a href="/settings?tab=billing" className="ml-auto">
                <Button size="sm" variant="outline">
                  View plans
                </Button>
              </a>
            </div>
          )
        ) : (
          canManage ? (
            <Button size="sm" variant="outline" onClick={goShared} loading={saving}>
              <Check className="size-4" /> Move back to shared pool
            </Button>
          ) : null
        )}
      </div>
    </div>
  );
}
