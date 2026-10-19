import type { TenantBranding } from "./types";

/**
 * Applies tenant branding to the document as CSS custom properties.
 * Derived shades are computed live with color-mix/contrast math so any hex
 * the tenant picks stays legible — no build step, no repaint jank.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export const DEFAULT_BRAND = "#6366f1";

export function applyBranding(branding: TenantBranding | null | undefined): void {
  const root = document.documentElement;
  const primary = branding?.primaryColor && hexToRgb(branding.primaryColor) ? branding.primaryColor : DEFAULT_BRAND;
  const rgb = hexToRgb(primary)!;
  const luminance = relativeLuminance(rgb);

  root.style.setProperty("--brand", primary);
  root.style.setProperty("--brand-strong", `color-mix(in oklab, ${primary} 82%, black)`);
  root.style.setProperty("--brand-soft", `color-mix(in srgb, ${primary} 13%, transparent)`);
  root.style.setProperty("--brand-ring", `color-mix(in srgb, ${primary} 45%, transparent)`);
  root.style.setProperty("--brand-foreground", luminance > 0.55 ? "#0b0d12" : "#ffffff");
  root.style.setProperty("--brand-text", `color-mix(in oklab, ${primary} 62%, white)`);

  if (branding?.accentColor && hexToRgb(branding.accentColor)) {
    root.style.setProperty("--accent-brand", branding.accentColor);
  }
}

export function resetBranding(): void {
  const root = document.documentElement;
  for (const prop of ["--brand", "--brand-strong", "--brand-soft", "--brand-ring", "--brand-foreground", "--brand-text", "--accent-brand"]) {
    root.style.removeProperty(prop);
  }
}
