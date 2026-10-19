"use client";

import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import type { Order } from "@/lib/types";
import { formatCurrency, relativeTime } from "@/lib/format";
import { Badge, ORDER_STATUS_TONE } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";

export function RecentOrders({ data }: { data: Order[] }) {
  return (
    <div className="card-sheen flex h-full flex-col rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Recent orders</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Latest activity in your store</p>
        </div>
        <Link
          href="/orders"
          className="focus-brand inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-brand-text transition-opacity hover:opacity-80"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart />}
          title="No orders yet"
          description="Orders placed in this workspace will appear here."
          action={
            <Link
              href="/orders?new=1"
              className="focus-brand inline-flex h-8 items-center rounded-md bg-brand px-3 text-[13px] font-medium text-brand-foreground"
            >
              Create order
            </Link>
          }
        />
      ) : (
        <ul className="flex-1 divide-y divide-border/70 px-2 py-2">
          {data.slice(0, 6).map((order) => (
            <li key={order.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {order.customer
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? "")
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-foreground">{order.customer}</span>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">{order.number}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{order.product}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular text-[13px] font-medium text-foreground">{formatCurrency(order.amount)}</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"} dot className="px-1.5 py-0 text-[10px] leading-3.5">
                    {order.status.toLowerCase()}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{relativeTime(order.createdAt)}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
