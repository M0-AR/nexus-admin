"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty";
import { PieChart as PieIcon } from "lucide-react";
import type { OrderChannel } from "@/lib/types";

const FALLBACK_RAMP = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#ddd6fe", "#e0e7ff"];

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function ChannelsDonut({ data }: { data: Array<{ channel: OrderChannel; count: number }> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.count - a.count);
    return sorted.map((row, index) => ({
      ...row,
      color: mounted
        ? cssVar(`--chart-${Math.min(index + 1, 6)}`, FALLBACK_RAMP[index % FALLBACK_RAMP.length]!)
        : FALLBACK_RAMP[index % FALLBACK_RAMP.length]!,
    }));
  }, [data, mounted]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.count, 0), [rows]);
  const cardColor = mounted ? cssVar("--card", "#fff") : "#fff";

  return (
    <div className="card-sheen flex h-full flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="px-5 pt-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Acquisition channels</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Where orders came from this period</p>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<PieIcon />} title="No channel data yet" description="Create orders to see the channel mix." />
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3 px-5 py-4">
          <div className="relative w-full">
            {!mounted ? (
              <Skeleton className="mx-auto h-[180px] w-[180px] rounded-full" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={rows}
                      dataKey="count"
                      nameKey="channel"
                      innerRadius={61}
                      outerRadius={83}
                      paddingAngle={2.2}
                      cornerRadius={3}
                      strokeWidth={2}
                      stroke={cardColor}
                    >
                      {rows.map((row) => (
                        <Cell key={row.channel} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChannelTooltip total={total} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tabular text-[22px] leading-none font-semibold text-foreground">{formatNumber(total)}</span>
                  <span className="mt-1 text-[11px] text-muted-foreground">orders</span>
                </div>
              </>
            )}
          </div>

          <ul className="w-full space-y-1.5">
            {rows.map((row) => (
              <li key={row.channel} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} aria-hidden />
                <span className="flex-1 truncate text-muted-foreground capitalize">{row.channel.toLowerCase()}</span>
                <span className="tabular font-medium text-foreground">{formatNumber(row.count)}</span>
                <span className="tabular w-10 text-right text-muted-foreground">
                  {total > 0 ? `${Math.round((row.count / total) * 100)}%` : "0%"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChannelTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  const value = item.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="text-[12px] font-medium text-foreground capitalize">{item.name?.toLowerCase()}</p>
      <p className="tabular text-[12px] text-muted-foreground">
        {formatNumber(value)} orders · {total > 0 ? Math.round((value / total) * 100) : 0}%
      </p>
    </div>
  );
}
