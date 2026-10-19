"use client";

import Link from "next/link";
import { Activity as ActivityIcon, DollarSign, Eye, Percent, Plus, ShoppingCart, Users } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ChannelsDonut } from "@/components/dashboard/channels-donut";
import { TopProducts } from "@/components/dashboard/top-products";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<DashboardSummary>("/dashboard/summary");

  const firstName = user?.name.split(/\s+/)[0] ?? "there";

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20 text-center">
        <ActivityIcon className="size-6 text-muted-foreground" />
        <p className="mt-3 text-[14px] font-medium text-foreground">Could not load your dashboard</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (loading || !data) {
    return <DashboardSkeleton firstName={firstName} />;
  }

  const sparkRevenue = data.revenueDaily.slice(-14).map((d) => d.revenue);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-foreground">Good to see you, {firstName}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Here's how your store performed over the last {data.period.days} days.
          </p>
        </div>
        <Link href="/orders?new=1">
          <Button size="sm">
            <Plus className="size-4" /> New order
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          title="Revenue"
          value={formatCurrency(data.stats.revenue.value)}
          delta={data.stats.revenue.delta}
          icon={<DollarSign />}
          spark={sparkRevenue}
          hero
        />
        <StatCard
          title="Orders"
          value={formatNumber(data.stats.orders.value)}
          delta={data.stats.orders.delta}
          icon={<ShoppingCart />}
        />
        <StatCard
          title="Customers"
          value={formatNumber(data.stats.customers.value)}
          delta={data.stats.customers.delta}
          icon={<Users />}
        />
        <StatCard
          title="Visits"
          value={formatNumber(data.stats.visits.value)}
          delta={data.stats.visits.delta}
          icon={<Eye />}
        />
        <StatCard
          title="Conversion"
          value={formatPercent(data.stats.conversion.value, 2)}
          delta={data.stats.conversion.delta}
          icon={<Percent />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart data={data.revenueDaily} />
        </div>
        <ChannelsDonut data={data.channels} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TopProducts data={data.topProducts} />
        <RecentOrders data={data.recentOrders} />
        <ActivityFeed data={data.activity} />
      </div>
    </div>
  );
}

function DashboardSkeleton({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-foreground">Good to see you, {firstName}</h2>
        <Skeleton className="mt-1.5 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Skeleton className="h-[124px] rounded-xl sm:col-span-2" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-[356px] rounded-xl xl:col-span-2" />
        <Skeleton className="h-[356px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[320px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
