"use client";

import { Package } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty";

export function TopProducts({
  data,
}: {
  data: Array<{ product: string; revenue: number; orders: number }>;
}) {
  const max = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="card-sheen flex h-full flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="px-5 pt-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Top products</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">By revenue this period</p>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={<Package />} title="No product sales yet" description="Paid orders will rank products here." />
      ) : (
        <ul className="flex-1 space-y-4 px-5 py-5">
          {data.slice(0, 6).map((row, index) => (
            <li key={row.product}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="tabular w-4 shrink-0 text-right text-[11.5px] font-semibold text-muted-foreground/70">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium text-foreground">{row.product}</span>
                </span>
                <span className="tabular shrink-0 font-semibold text-foreground">{formatCurrency(row.revenue)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/70">
                  <div
                    className="h-full rounded-full bg-brand opacity-90 transition-all duration-500"
                    style={{ width: `${Math.max(4, (row.revenue / max) * 100)}%` }}
                  />
                </div>
                <span className="tabular w-16 text-right text-[11.5px] text-muted-foreground">
                  {formatNumber(row.orders)} orders
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
