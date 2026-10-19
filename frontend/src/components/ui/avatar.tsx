import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function avatarColors(hex?: string): { backgroundColor: string; color: string } {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return { backgroundColor: hex ?? "#64748b", color: "#ffffff" };
  const lum = luminance(hex);
  const white = ratio(1, lum);
  const dark = ratio(lum, 0.006);
  if (white >= 4.5) return { backgroundColor: hex, color: "#ffffff" };
  if (dark >= 4.5) return { backgroundColor: hex, color: "#0b0d12" };
  for (let step = 1; step <= 10; step++) {
    const f = 1 - step * 0.05;
    const rgb = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f));
    const darker = "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
    if (ratio(1, luminance(darker)) >= 4.5) return { backgroundColor: darker, color: "#ffffff" };
  }
  return { backgroundColor: hex, color: "#ffffff" };
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        SIZES[size],
        className,
      )}
      style={avatarColors(color)}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function BrandMark({
  logoText,
  emoji,
  size = "md",
  className,
}: {
  logoText?: string;
  emoji?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = logoText?.slice(0, 3) ?? "N";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-brand font-bold text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] select-none",
        SIZES[size],
        className,
      )}
    >
      {emoji ? <span className="text-[0.85em]">{emoji}</span> : label}
    </span>
  );
}
