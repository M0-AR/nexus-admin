"use client";

import { useEffect, useState } from "react";
import { Check, Palette, Save } from "lucide-react";
import type { BrandingResponse } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const HEX = /^#[0-9a-fA-F]{6}$/;

interface FormState {
  name: string;
  logoText: string;
  primaryColor: string;
  accentColor: string;
  faviconEmoji: string;
}

const FALLBACK: FormState = {
  name: "",
  logoText: "NX",
  primaryColor: "#6366f1",
  accentColor: "#8b5cf6",
  faviconEmoji: "⚡",
};

export function BrandingTab() {
  const { role, updateBranding } = useAuth();
  const { success, error: errorToast } = useToast();
  const { data, loading, error, reload } = useApi<BrandingResponse>("/settings/branding");

  const canEdit = role === "OWNER" || role === "ADMIN";

  const [form, setForm] = useState<FormState>(FALLBACK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name,
      logoText: data.branding.logoText ?? "",
      primaryColor: data.branding.primaryColor ?? FALLBACK.primaryColor,
      accentColor: data.branding.accentColor ?? FALLBACK.accentColor,
      faviconEmoji: data.branding.faviconEmoji ?? "",
    });
  }, [data]);

  const save = async () => {
    setFormError(null);
    if (!form.name.trim()) return setFormError("Workspace name is required");
    if (!form.logoText.trim() || form.logoText.trim().length > 4) return setFormError("Logo text must be 1–4 characters");
    if (!HEX.test(form.primaryColor)) return setFormError("Primary color must be a hex value like #6366f1");
    if (!HEX.test(form.accentColor)) return setFormError("Accent color must be a hex value like #8b5cf6");

    setSaving(true);
    try {
      const result = await api.patch<BrandingResponse>("/settings/branding", {
        name: form.name.trim(),
        logoText: form.logoText.trim(),
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        faviconEmoji: form.faviconEmoji.trim() || undefined,
      });
      updateBranding(result.branding, result.name);
      success("Branding updated");
      reload();
    } catch (err) {
      errorToast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Skeleton className="h-[420px] rounded-xl xl:col-span-3" />
        <Skeleton className="h-[420px] rounded-xl xl:col-span-2" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <p className="text-[13.5px] text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <div className="card-sheen rounded-xl border border-border bg-card shadow-[var(--shadow-card)] xl:col-span-3">
        <div className="border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            <Palette className="size-4 text-muted-foreground" /> Workspace branding
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {canEdit
              ? "Applied instantly to the sidebar, buttons and login page for everyone in this workspace."
              : "Only owners and admins can change branding."}
          </p>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Workspace name">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Logo text" hint="1–4 characters shown in the sidebar mark.">
              <Input
                value={form.logoText}
                maxLength={4}
                onChange={(e) => setForm((f) => ({ ...f, logoText: e.target.value.toUpperCase() }))}
                disabled={!canEdit}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Primary color">
              <ColorInput
                value={form.primaryColor}
                onChange={(v) => setForm((f) => ({ ...f, primaryColor: v }))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Accent color">
              <ColorInput
                value={form.accentColor}
                onChange={(v) => setForm((f) => ({ ...f, accentColor: v }))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Favicon emoji" hint="Max 8 characters.">
              <Input
                value={form.faviconEmoji}
                maxLength={8}
                onChange={(e) => setForm((f) => ({ ...f, faviconEmoji: e.target.value }))}
                disabled={!canEdit}
                placeholder="⚡"
              />
            </Field>
          </div>
          {formError ? (
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {formError}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3.5">
            <Button variant="secondary" size="sm" onClick={reload} disabled={saving}>
              Reset
            </Button>
            <Button size="sm" onClick={save} loading={saving}>
              <Save className="size-4" /> Save changes
            </Button>
          </div>
        ) : null}
      </div>

      <div className="xl:col-span-2">
        <BrandPreview form={form} />
      </div>
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={HEX.test(value) ? value : "#6366f1"}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="focus-brand h-9.5 w-11 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Pick color"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-[13px]"
        placeholder="#6366f1"
      />
    </div>
  );
}

function BrandPreview({ form }: { form: FormState }) {
  const brand = HEX.test(form.primaryColor) ? form.primaryColor : FALLBACK.primaryColor;
  const accent = HEX.test(form.accentColor) ? form.accentColor : FALLBACK.accentColor;

  return (
    <div className="card-sheen sticky top-20 rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Live preview</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">How this workspace looks right now.</p>
      </div>
      <div className="p-5">
        <div
          className="overflow-hidden rounded-xl border border-border shadow-[var(--shadow-pop)]"
          style={{ "--brand": brand } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-brand-strong text-[10px] font-bold text-brand-foreground">
              {form.logoText || "NX"}
            </span>
            <span className="truncate text-[12.5px] font-semibold text-foreground">{form.name || "Your workspace"}</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" />
              <span className="text-[10.5px] text-muted-foreground">Live</span>
            </span>
          </div>
          <div className="flex bg-muted/30">
            <div className="w-20 space-y-1.5 border-r border-border/70 p-2.5">
              <span className="block rounded-md bg-brand-soft px-2 py-1 text-[10.5px] font-medium text-brand-text">Dashboard</span>
              <span className="block px-2 py-1 text-[10.5px] text-muted-foreground">Orders</span>
              <span className="block px-2 py-1 text-[10.5px] text-muted-foreground">Products</span>
            </div>
            <div className="flex-1 space-y-2.5 p-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-[10.5px] text-muted-foreground">Revenue</span>
                <span className="text-[12px] font-semibold text-foreground">$12,480</span>
              </div>
              <div className="h-8 rounded-lg" style={{ background: `linear-gradient(90deg, ${brand}33, ${accent}22)` }} />
              <div className="flex gap-2">
                <span className="inline-flex h-6 items-center rounded-md bg-brand-strong px-2.5 text-[10.5px] font-medium text-brand-foreground">
                  Primary
                </span>
                <span
                  className="inline-flex h-6 items-center rounded-md px-2.5 text-[10.5px] font-medium"
                  style={{ backgroundColor: `${accent}22`, color: accent }}
                >
                  Accent
                </span>
                <span className="ml-auto inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[10.5px] text-muted-foreground">
                  <Check className="size-3 text-success" /> Saved
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Tip: pick a primary color with enough contrast — the sidebar mark and primary buttons use it everywhere.
        </p>
      </div>
    </div>
  );
}
