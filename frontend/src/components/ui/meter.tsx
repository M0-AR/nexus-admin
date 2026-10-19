import { cn } from "@/lib/utils";

export function Meter({
  value,
  max,
  label,
  suffix,
  tone = "auto",
  className,
}: {
  value: number;
  max: number;
  label?: string;
  suffix?: string;
  tone?: "auto" | "brand" | "success" | "danger";
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const resolved =
    tone === "auto" ? (pct >= 90 ? "danger" : pct >= 70 ? "brand" : "success") : tone;

  const bar =
    resolved === "danger"
      ? "bg-danger"
      : resolved === "success"
        ? "bg-success"
        : "bg-brand";

  return (
    <div className={cn("w-full", className)}>
      {label || suffix ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <span className="tabular text-[12.5px] text-muted-foreground">{suffix}</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
