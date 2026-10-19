import { Injectable } from "@nestjs/common";
import type { RequestTenant } from "../common/request-types.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import { UsageService } from "../billing/usage.service.ts";

interface DayRow {
  day: string;
  revenue: number;
  orders: number;
}

interface WindowRow {
  revenue_30: number;
  revenue_prev: number;
  orders_30: number;
  orders_prev: number;
  customers_30: number;
  customers_prev: number;
}

const emptyWindow: WindowRow = {
  revenue_30: 0,
  revenue_prev: 0,
  orders_30: 0,
  orders_prev: 0,
  customers_30: 0,
  customers_prev: 0,
};

function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly usage: UsageService,
  ) {}

  async summary(tenant: RequestTenant) {
    const window = await this.tenantDb.run(tenant, async (tx) => {
      const [days, totals, channels, topProducts, recentOrders, notifications, activity] = await Promise.all([
        tx.$queryRawUnsafe<DayRow[]>(
          `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                  COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0)::float8 AS revenue,
                  COUNT(*)::int AS orders
             FROM orders
            WHERE tenant_id = $1::uuid AND created_at >= now() - interval '180 days'
            GROUP BY 1
            ORDER BY 1`,
          tenant.id,
        ),
        tx.$queryRawUnsafe<WindowRow[]>(
          `SELECT
             COALESCE(SUM(amount) FILTER (WHERE status = 'PAID' AND created_at >= now() - interval '30 days'), 0)::float8 AS revenue_30,
             COALESCE(SUM(amount) FILTER (WHERE status = 'PAID' AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'), 0)::float8 AS revenue_prev,
             COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS orders_30,
             COUNT(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days')::int AS orders_prev,
             COUNT(DISTINCT lower(email)) FILTER (WHERE email IS NOT NULL AND created_at >= now() - interval '30 days')::int AS customers_30,
             COUNT(DISTINCT lower(email)) FILTER (WHERE email IS NOT NULL AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days')::int AS customers_prev
           FROM orders
          WHERE tenant_id = $1::uuid AND created_at >= now() - interval '60 days'`,
          tenant.id,
        ),
        tx.order.groupBy({
          by: ["channel"],
          where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          _count: true,
        }),
        tx.order.groupBy({
          by: ["product"],
          where: { status: "PAID", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
          _sum: { amount: true },
          _count: true,
          orderBy: { _sum: { amount: "desc" } },
          take: 5,
        }),
        tx.order.findMany({ orderBy: { createdAt: "desc" }, take: 7 }),
        tx.notification.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
        tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
      ]);
      return { days, totals: totals[0] ?? emptyWindow, channels, topProducts, recentOrders, notifications, activity };
    });

    const visits = await this.usage.series(tenant, "visits", 60);
    const visits30 = visits.slice(30).reduce((a, r) => a + r.quantity, 0);
    const visitsPrev = visits.slice(0, 30).reduce((a, r) => a + r.quantity, 0);
    const conversion = visits30 > 0 ? (window.totals.orders_30 / visits30) * 100 : 0;
    const conversionPrev = visitsPrev > 0 ? (window.totals.orders_prev / visitsPrev) * 100 : 0;

    const byDay = new Map(window.days.map((d) => [d.day, d]));
    const revenueDaily: DayRow[] = [];
    for (let i = 179; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      revenueDaily.push(byDay.get(day) ?? { day, revenue: 0, orders: 0 });
    }

    return {
      period: { label: "Last 30 days", days: 30 },
      stats: {
        revenue: { value: window.totals.revenue_30, prev: window.totals.revenue_prev, delta: delta(window.totals.revenue_30, window.totals.revenue_prev) },
        orders: { value: window.totals.orders_30, prev: window.totals.orders_prev, delta: delta(window.totals.orders_30, window.totals.orders_prev) },
        customers: { value: window.totals.customers_30, prev: window.totals.customers_prev, delta: delta(window.totals.customers_30, window.totals.customers_prev) },
        visits: { value: visits30, prev: visitsPrev, delta: delta(visits30, visitsPrev) },
        conversion: { value: Number(conversion.toFixed(2)), prev: Number(conversionPrev.toFixed(2)), delta: delta(conversion, conversionPrev) },
      },
      revenueDaily,
      channels: window.channels.map((c) => ({ channel: c.channel, count: c._count })),
      topProducts: window.topProducts.map((p) => ({
        product: p.product,
        revenue: Number(p._sum.amount ?? 0),
        orders: p._count,
      })),
      recentOrders: window.recentOrders.map((o) => ({
        id: o.id,
        number: o.number,
        customer: o.customer,
        email: o.email,
        product: o.product,
        amount: Number(o.amount),
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      notifications: window.notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      activity: window.activity.map((a) => ({
        id: a.id,
        actorEmail: a.actorEmail,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
