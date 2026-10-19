/** Shared API types mirroring the NestJS backend contracts. */

export type MembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
export type PlanTier = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED";
export type IsolationMode = "SHARED" | "DEDICATED";
export type OrderStatus = "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" | "FAILED";
export type OrderChannel = "DIRECT" | "ORGANIC" | "REFERRAL" | "SOCIAL" | "PARTNER" | "EMAIL";
export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
export type FeatureKey =
  | "analytics"
  | "custom_domain"
  | "audit_log"
  | "byok"
  | "white_label"
  | "sso"
  | "api_access"
  | "priority_support";

export interface TenantBranding {
  logoText?: string;
  primaryColor?: string;
  accentColor?: string;
  faviconEmoji?: string;
}

export interface MembershipSummary {
  tenantId: string;
  slug: string;
  name: string;
  role: MembershipRole;
}

export interface AuthBundle {
  accessToken: string;
  user: { id: string; email: string; name: string; avatarColor: string };
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: PlanTier;
    branding: TenantBranding;
    dataRegion: string;
  };
  role: MembershipRole;
  memberships: MembershipSummary[];
}

export interface ApiErrorShape {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

export interface PlanInfo {
  tier: PlanTier;
  name: string;
  tagline?: string;
  priceMonthly: number | null;
  seats?: number;
  requestsPerMinute: number;
  features: Record<FeatureKey, boolean>;
  overrides?: Partial<Record<FeatureKey, boolean>>;
  limits: { ordersPerMonth: number; products: number };
}

export interface BillingOverview {
  subscription: {
    plan: PlanTier;
    status: string;
    seats: number;
    currentPeriodEnd: string;
    stripeCustomerId: string | null;
  } | null;
  plan: PlanInfo;
  seats: { used: number; limit: number };
  period: { start: string; end: string };
  usage: {
    api_calls: { total: number; daily: Array<{ day: string; quantity: number }> };
    orders: { total: number };
    visits: { total: number };
    limits: { ordersPerMonth: number; products: number };
  };
  plans: PlanInfo[];
  featureMeta: Array<{ key: FeatureKey; label: string; description: string }>;
}

export interface DashboardSummary {
  period: { label: string; days: number };
  stats: Record<
    "revenue" | "orders" | "customers" | "visits" | "conversion",
    { value: number; prev: number; delta: number | null }
  >;
  revenueDaily: Array<{ day: string; revenue: number; orders: number }>;
  channels: Array<{ channel: OrderChannel; count: number }>;
  topProducts: Array<{ product: string; revenue: number; orders: number }>;
  recentOrders: Order[];
  notifications: NotificationItem[];
  activity: Array<{ id: string; action: string; actorEmail: string; createdAt: string }>;
}

export interface Order {
  id: string;
  number: string;
  customer: string;
  email: string | null;
  product: string;
  channel: OrderChannel;
  amount: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: MembershipRole;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface TenantMe {
  id: string;
  slug: string;
  name: string;
  plan: PlanTier;
  status: TenantStatus;
  isolationMode: IsolationMode;
  dataRegion: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  branding: TenantBranding;
  dedicatedDatabaseUrl: string | null;
}

export interface MembersResponse {
  items: Member[];
  seats: { used: number; limit: number };
}

export interface InviteResponse {
  member: Member;
  tempPassword?: string;
}

export interface BrandingResponse {
  name: string;
  branding: TenantBranding;
}

export interface DomainResponse {
  domain: string;
  verified: boolean;
  verificationToken: string;
  instructions: string;
}

export interface DomainVerifyResponse {
  verified: boolean;
  domain?: string;
  code?: string;
  message?: string;
  found?: string[];
}

export interface SecretItem {
  key: string;
  maskedValue: string;
  rotatedAt: string;
}

export interface RotateSecretResponse {
  key: string;
  value: string;
  rotatedAt: string;
  note: string;
}

export interface TenantPublic {
  slug: string;
  name: string;
  status: TenantStatus;
  branding: TenantBranding;
  plan: { tier: PlanTier; name: string };
  features: Record<FeatureKey, boolean>;
}
