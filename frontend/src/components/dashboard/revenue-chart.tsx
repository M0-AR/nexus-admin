"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatCurrency } from "@/lib/format";
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";

export interface RevenuePoint {
  day: string;
  revenue: number;
  orders: number;
}

type Range = "7" | "30" | "90";

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>("30");

  useEffect(() => setMounted(true), []);

  const days = Number(range);

  const { rows, total, prevTotal, deltaPct } = useMemo(() => {
    const current = data.slice(-days);
    const previous = data.slice(-days * 2, -days);
    const rows = current.map((point, index) => ({
      day: point.day,
      label: shortDay(point.day),
      current: Math.round(point.revenue * 100) / 100,
      previous: previous[index] ? Math.round(previous[index]!.revenue * 100) / 100 : null,
    }));
    const total = current.reduce((sum, p) => sum + p.revenue, 0);
    const prevTotal = previous.reduce((sum, p) => sum + p.revenue, 0);
    const deltaPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
    return { rows, total, prevTotal, deltaPct };
  }, [data, days]);

  const brand = mounted ? cssVar("--brand", "#6366f1") : "#6366f1";
  const grid = mounted ? cssVar("--border", "#e2e8f0") : "#e2e8f0";
  const muted = mounted ? cssVar("--muted-foreground", "#64748b") : "#64748b";
  const cardBg = mounted ? cssVar("--card", "#fff") : "#fff";

  return (
    <div className="card-sheen flex h-full flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Revenue</h3>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="tabular text-[24px] leading-none font-semibold tracking-tight text-foreground">
              {formatCurrency(total)}
            </span>
            {deltaPct !== null ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${
                  deltaPct >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            vs {formatCurrency(prevTotal)} previous {days}d
          </p>
          <div className="mt-3 flex items-center gap-4 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full bg-brand" aria-hidden /> This period
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-muted-foreground/50" aria-hidden /> Previous
            </span>
          </div>
        </div>
        <SegmentedControl<Range>
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { label: "7D", value: "7" },
            { label: "30D", value: "30" },
            { label: "90D", value: "90" },
          ]}
        />
      </div>

      <div className="mt-3 min-h-[260px] flex-1 px-2 pb-3">
        {!mounted ? (
          <Skeleton className="mx-3 h-[250px]" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={brand} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={grid} strokeOpacity={0.35} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: muted, fontSize: 10.5 }}
                interval="preserveStartEnd"
                minTickGap={36}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: muted, fontSize: 10.5 }}
                tickFormatter={(v: number) => formatCompact(v)}
                width={46}
              />
              <Tooltip content={<RevenueTooltip />} cursor={{ stroke: grid }} />
              <Area
                type="monotone"
                dataKey="previous"
                name="Previous"
                stroke={muted}
                strokeOpacity={0.55}
                strokeWidth={1.25}
                strokeDasharray="3 3"
                fill="transparent"
                dot={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="current"
                name="Revenue"
                stroke={brand}
                strokeWidth={2}
                fill="url(#revenue-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: cardBg, fill: brand }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number;
  payload?: { previous?: number | null };
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const current = payload.find((p) => p.dataKey === "current")?.value;
  const previous = payload.find((p) => p.dataKey === "previous")?.value;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {current !== undefined ? (
        <p className="tabular mt-1 text-[13px] font-semibold text-foreground">{formatCurrency(current)}</p>
      ) : null}
      {previous !== undefined && previous !== null ? (
        <p className="tabular text-[11.5px] text-muted-foreground">prev {formatCurrency(previous)}</p>
      ) : null}
    </div>
  );
}
