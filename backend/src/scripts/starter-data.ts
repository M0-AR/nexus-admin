import type { TenantTx } from "../prisma/tenant-db.service.ts";

/**
 * Deterministic starter data for a freshly provisioned tenant. Reused by the
 * signup flow (small scale) and the demo seed (full scale — 90 days of
 * history for two showroom tenants).
 */

export interface StarterOptions {
  ordersStartNumber?: number;
  seed?: string;
  scale?: "small" | "full";
}

const CUSTOMERS = [
  "Northwind Studio",
  "Acme Retail",
  "Blue Harbor",
  "Cedar Labs",
  "Delta Works",
  "Evergreen Co",
  "Granite Systems",
  "Ironclad Supply",
  "Juniper Health",
  "Kite & Co",
  "Meridian Group",
  "Pinewood Digital",
];

const PRODUCTS: Array<{ name: string; sku: string; price: number; stock: number; status: "ACTIVE" | "DRAFT" | "ARCHIVED" }> = [
  { name: "Atlas Pro Plan", sku: "ATL-PRO", price: 149, stock: 999, status: "ACTIVE" },
  { name: "Orbit Starter", sku: "ORB-STR", price: 49, stock: 999, status: "ACTIVE" },
  { name: "Pulse Analytics", sku: "PLS-ANL", price: 89, stock: 480, status: "ACTIVE" },
  { name: "Relay API Pack", sku: "RLY-API", price: 199, stock: 240, status: "ACTIVE" },
  { name: "Compass Add-on", sku: "CMP-ADD", price: 29, stock: 0, status: "DRAFT" },
  { name: "Legacy Sync", sku: "LGC-SYNC", price: 19, stock: 0, status: "ARCHIVED" },
];

const CHANNELS: Array<{ value: "DIRECT" | "ORGANIC" | "REFERRAL" | "SOCIAL" | "PARTNER" | "EMAIL"; weight: number }> = [
  { value: "DIRECT", weight: 30 },
  { value: "ORGANIC", weight: 25 },
  { value: "REFERRAL", weight: 15 },
  { value: "SOCIAL", weight: 12 },
  { value: "PARTNER", weight: 10 },
  { value: "EMAIL", weight: 8 },
];

const STATUSES: Array<{ value: "PAID" | "PENDING" | "REFUNDED" | "CANCELLED" | "FAILED"; weight: number }> = [
  { value: "PAID", weight: 76 },
  { value: "PENDING", weight: 10 },
  { value: "REFUNDED", weight: 7 },
  { value: "CANCELLED", weight: 4 },
  { value: "FAILED", weight: 3 },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weighted<T extends { weight: number }>(rand: () => number, items: T[]): T {
  const total = items.reduce((acc, i) => acc + i.weight, 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createStarterData(tx: TenantTx, tenantId: string, options: StarterOptions = {}): Promise<void> {
  const scale = options.scale ?? "small";
  const rand = mulberry32(hashString(options.seed ?? tenantId));
  const days = scale === "full" ? 90 : 14;
  const avgOrdersPerDay = scale === "full" ? 1.6 : 0.9;
  const productCount = scale === "full" ? PRODUCTS.length : 4;

  // Products
  await tx.product.createMany({
    data: PRODUCTS.slice(0, productCount).map((p) => ({
      tenantId,
      name: p.name,
      sku: p.sku,
      price: p.price,
      stock: p.stock,
      status: p.status,
    })),
  });

  // Orders across `days` of history
  const orders: Array<{
    tenantId: string;
    number: string;
    customer: string;
    email: string;
    product: string;
    channel: "DIRECT" | "ORGANIC" | "REFERRAL" | "SOCIAL" | "PARTNER" | "EMAIL";
    amount: number;
    currency: string;
    status: "PAID" | "PENDING" | "REFUNDED" | "CANCELLED" | "FAILED";
    createdAt: Date;
  }> = [];

  let number = options.ordersStartNumber ?? 1001;
  const now = Date.now();
  for (let d = days - 1; d >= 0; d -= 1) {
    const dayStart = now - d * 86_400_000;
    const waveFactor = 0.7 + 0.6 * Math.sin((days - d) / 9); // gentle seasonality
    const count = Math.max(0, Math.round(avgOrdersPerDay * waveFactor + (rand() - 0.5)));
    for (let i = 0; i < count; i += 1) {
      const customer = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
      const product = PRODUCTS[Math.floor(rand() * Math.min(productCount, 4))];
      const channel = weighted(rand, CHANNELS).value;
      const older = d > 7;
      const statusRoll = weighted(rand, STATUSES).value;
      const status = older && statusRoll === "PENDING" ? "PAID" : statusRoll;
      const createdAt = new Date(dayStart - Math.floor(rand() * 20 * 3_600_000));
      orders.push({
        tenantId,
        number: `NC-${number}`,
        customer,
        email: `hello@${slugify(customer)}.test`,
        product: product.name,
        channel,
        amount: Math.round((product.price * (0.8 + rand() * 1.6)) * 10) / 10,
        currency: "USD",
        status,
        createdAt,
      });
      number += 1;
    }
  }
  await tx.order.createMany({ data: orders });

  // Daily usage: api calls, visits, orders (feeds conversion + billing)
  const usage: Array<{ tenantId: string; metric: string; quantity: number; day: Date }> = [];
  const usageDays = scale === "full" ? 30 : 14;
  for (let d = usageDays - 1; d >= 0; d -= 1) {
    const day = new Date(Date.UTC(new Date(now - d * 86_400_000).getUTCFullYear(), new Date(now - d * 86_400_000).getUTCMonth(), new Date(now - d * 86_400_000).getUTCDate()));
    const dayOrders = orders.filter((o) => o.createdAt.toISOString().slice(0, 10) === day.toISOString().slice(0, 10)).length;
    usage.push({ tenantId, metric: "api_calls", quantity: 800 + Math.floor(rand() * 1700), day });
    usage.push({ tenantId, metric: "visits", quantity: 140 + Math.floor(rand() * 280), day });
    usage.push({ tenantId, metric: "orders", quantity: dayOrders, day });
  }
  await tx.usageRecord.createMany({ data: usage, skipDuplicates: true });

  // Notifications
  const notifications = [
    { type: "USER" as const, title: "New user registered", body: "Priya Sharma joined your workspace as Manager.", read: false },
    { type: "PAYMENT" as const, title: "Payment received", body: "You received $1,240.00 from Northwind Studio.", read: false },
    { type: "ALERT" as const, title: "Traffic spike detected", body: "Requests are 3.2× above the weekly average.", read: false },
    { type: "REPORT" as const, title: "Weekly report is ready", body: "Your performance summary for this week is available.", read: false },
    { type: "USER" as const, title: "Invite accepted", body: "Marcus Chen accepted your invitation.", read: true },
    { type: "SYSTEM" as const, title: "Backup completed", body: "Nightly backup finished in 42 seconds.", read: true },
    { type: "PAYMENT" as const, title: "Invoice paid", body: "Invoice #INV-2041 was paid in full.", read: true },
  ].slice(0, scale === "full" ? 7 : 4);

  const nowTime = Date.now();
  await tx.notification.createMany({
    data: notifications.map((n, i) => ({
      tenantId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: new Date(nowTime - (i + 1) * 5_400_000),
    })),
  });
}
