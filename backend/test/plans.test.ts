import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, FEATURE_LABELS, PLANS } from "../src/billing/plans.ts";
import { parseDuration } from "../src/config/env.ts";
import { pickAvatarColor } from "../src/common/avatar.ts";

const TIERS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;

describe("plan catalog", () => {
  it("defines every tier with all feature keys", () => {
    for (const tier of TIERS) {
      const plan = PLANS[tier];
      expect(plan.tier).toBe(tier);
      expect(Object.keys(plan.features).sort()).toEqual([...FEATURE_KEYS].sort());
    }
  });

  it("grants features monotonically across the tiers", () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lower = PLANS[TIERS[i - 1]!].features;
      const higher = PLANS[TIERS[i]!].features;
      for (const feature of FEATURE_KEYS) {
        if (lower[feature]) {
          expect(higher[feature], `${TIERS[i]} must retain ${feature}`).toBe(true);
        }
      }
    }
  });

  it("increases seats, request budgets and usage limits with price", () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lower = PLANS[TIERS[i - 1]!];
      const higher = PLANS[TIERS[i]!];
      expect(higher.seats).toBeGreaterThan(lower.seats);
      expect(higher.requestsPerMinute).toBeGreaterThan(lower.requestsPerMinute);
      expect(higher.limits.ordersPerMonth).toBeGreaterThan(lower.limits.ordersPerMonth);
      expect(higher.limits.products).toBeGreaterThan(lower.limits.products);
      if (lower.priceMonthly !== null && higher.priceMonthly !== null) {
        expect(higher.priceMonthly).toBeGreaterThan(lower.priceMonthly);
      }
    }
    expect(PLANS.ENTERPRISE.priceMonthly).toBeNull();
  });

  it("labels every feature for the billing UI", () => {
    for (const feature of FEATURE_KEYS) {
      expect(FEATURE_LABELS[feature]?.label.length).toBeGreaterThan(0);
      expect(FEATURE_LABELS[feature]?.description.length).toBeGreaterThan(0);
    }
  });
});

describe("parseDuration", () => {
  it.each([
    ["45s", 45],
    ["15m", 900],
    ["1h", 3600],
    ["30d", 2_592_000],
    ["10", 10],
    [" 5m ", 300],
  ])("parses %s as %i seconds", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "10x", "-5m", "1.5h"])("rejects %s", (input) => {
    expect(() => parseDuration(input)).toThrow(/Invalid duration/);
  });
});

describe("pickAvatarColor", () => {
  it("is deterministic per seed", () => {
    expect(pickAvatarColor("owner@acme.test")).toBe(pickAvatarColor("owner@acme.test"));
  });

  it("always returns a palette hex color", () => {
    for (let i = 0; i < 50; i++) {
      expect(pickAvatarColor(`user-${i}@example.test`)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("spreads across the palette instead of collapsing to one color", () => {
    const colors = new Set(Array.from({ length: 40 }, (_, i) => pickAvatarColor(`user-${i}@example.test`)));
    expect(colors.size).toBeGreaterThan(3);
  });
});
