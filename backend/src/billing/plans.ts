import type { PlanTier } from "../generated/prisma/client.ts";

export type FeatureKey =
  | "analytics"
  | "custom_domain"
  | "audit_log"
  | "byok"
  | "white_label"
  | "sso"
  | "api_access"
  | "priority_support";

export interface PlanDef {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceMonthly: number | null; // null = custom pricing
  seats: number;
  /** Sustained requests per minute per tenant (pattern #6). + burst window. */
  requestsPerMinute: number;
  features: Record<FeatureKey, boolean>;
  limits: { ordersPerMonth: number; products: number };
}

const core: Record<FeatureKey, boolean> = {
  analytics: true,
  custom_domain: false,
  audit_log: false,
  byok: false,
  white_label: false,
  sso: false,
  api_access: true,
  priority_support: false,
};

export const PLANS: Record<PlanTier, PlanDef> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    tagline: "For side projects",
    priceMonthly: 0,
    seats: 3,
    requestsPerMinute: 60,
    features: { ...core, analytics: false, api_access: false },
    limits: { ordersPerMonth: 100, products: 10 },
  },
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    tagline: "For growing teams",
    priceMonthly: 29,
    seats: 5,
    requestsPerMinute: 300,
    features: { ...core },
    limits: { ordersPerMonth: 2_000, products: 50 },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    tagline: "For scale-ups",
    priceMonthly: 99,
    seats: 20,
    requestsPerMinute: 1_200,
    features: { ...core, custom_domain: true, audit_log: true },
    limits: { ordersPerMonth: 25_000, products: 500 },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Isolation, SSO, BYOK",
    priceMonthly: null,
    seats: 1_000,
    requestsPerMinute: 6_000,
    features: {
      analytics: true,
      custom_domain: true,
      audit_log: true,
      byok: true,
      white_label: true,
      sso: true,
      api_access: true,
      priority_support: true,
    },
    limits: { ordersPerMonth: 1_000_000, products: 100_000 },
  },
};

export const FEATURE_KEYS = Object.keys(core) as FeatureKey[];

export const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string }> = {
  analytics: { label: "Analytics", description: "Revenue trends, conversion and channel breakdowns" },
  custom_domain: { label: "Custom domain", description: "Serve the workspace on your own domain" },
  audit_log: { label: "Audit log", description: "Immutable record of every change" },
  byok: { label: "BYOK secrets vault", description: "Bring-your-own-key envelope encryption" },
  white_label: { label: "White-label branding", description: "Replace all platform branding" },
  sso: { label: "SSO / SAML", description: "Single sign-on with your identity provider" },
  api_access: { label: "API access", description: "Programmatic access with tenant API keys" },
  priority_support: { label: "Priority support", description: "24/7 support with 1h SLA" },
};
