import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success-soft text-[color-mix(in_oklab,var(--success)_72%,var(--foreground))]",
  warning: "bg-warning-soft text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]",
  danger: "bg-danger-soft text-[color-mix(in_oklab,var(--danger)_78%,var(--foreground))]",
  info: "bg-info-soft text-[color-mix(in_oklab,var(--info)_72%,var(--foreground))]",
  outline: "border border-border text-muted-foreground",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden /> : null}
      {children}
    </span>
  );
}

export const ORDER_STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  PAID: "info",
  REFUNDED: "neutral",
  CANCELLED: "danger",
  FAILED: "danger",
};

export const PRODUCT_STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "outline",
};

export const ROLE_TONE: Record<string, Tone> = {
  OWNER: "brand",
  ADMIN: "info",
  MANAGER: "warning",
  MEMBER: "neutral",
};
