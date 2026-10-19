import type { IsolationMode, MembershipRole, PlanTier, TenantStatus } from "../generated/prisma/client.ts";

export type Role = MembershipRole;

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: Role;
}

export interface RequestTenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan: PlanTier;
  isolationMode: IsolationMode;
  dedicatedDatabaseUrl: string | null;
  dataRegion: string;
  branding: TenantBranding;
  customDomain: string | null;
  customDomainVerified: boolean;
  domainVerificationToken: string | null;
}

export interface TenantBranding {
  logoText?: string;
  primaryColor?: string;
  accentColor?: string;
  faviconEmoji?: string;
}
