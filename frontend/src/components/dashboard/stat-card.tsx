"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  delta,
  icon,
  spark,
  hero = false,
}: {
  title: string;
  value: string;
  delta: number | null;
  icon: React.ReactNode;
  spark?: number[];
  /** Larger presentation for the single primary metric. */
  hero?: boolean;
}) {
  const positive = delta !== null && delta > 0;
  const negative = delta !== null && delta < 0;

  return (
    <div
      className={cn(
        "card-sheen group flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-muted-foreground/25",
        hero && "p-5 sm:col-span-2",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[12.5px] font-medium text-muted-foreground">{title}</span>
        <span
          className={cn(
            "shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground/80 [&>svg]:size-3.5",
            hero && "text-muted-foreground/60 [&>svg]:size-4",
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>

      <div className={cn("mt-2.5 flex items-end justify-between gap-4", hero && "mt-3")}>
        <div className="min-w-0">
          <p
            className={cn(
              "tabular truncate leading-none font-semibold tracking-tight text-foreground",
              hero ? "text-[30px]" : "text-[24px]",
            )}
          >
            {value}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[12px]">
            {delta === null ? (
              <>
                <span className="text-muted-foreground/60">—</span>
                <span className="text-muted-foreground">vs previous period</span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                    positive
                      ? "bg-success-soft text-success"
                      : negative
                        ? "bg-danger-soft text-danger"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {positive ? (
                    <ArrowUpRight className="size-3" aria-hidden />
                  ) : negative ? (
                    <ArrowDownRight className="size-3" aria-hidden />
                  ) : null}
                  {Math.abs(delta).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">vs prev</span>
              </>
            )}
          </p>
        </div>
        {hero && spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 96;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return { x, y };
    });
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-24 shrink-0 text-brand-text opacity-60 transition-opacity group-hover:opacity-100"
      aria-hidden
    >
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2" fill="currentColor" />
    </svg>
  );
}
