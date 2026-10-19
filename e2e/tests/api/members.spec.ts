import { expect, test, type APIRequestContext } from "@playwright/test";
import { bearer, newApiContext, provisionTenant, setPlan } from "../../support/api.ts";

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await newApiContext();
});
test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("members contract", () => {
  test("list returns members with seat usage", async () => {
    const temp = await provisionTenant(ctx, "members-list");
    const res = await ctx.get("/api/members", { headers: bearer(temp.accessToken) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].email).toBe(temp.user.email);
    expect(body.items[0].role).toBe("OWNER");
    expect(body.seats).toEqual({ used: 1, limit: 5 });
  });

  test("invite creates a member with a temp password; suspend frees the seat", async () => {
    const temp = await provisionTenant(ctx, "members-invite");
    const email = `invitee-${Date.now().toString(36)}@e2e.test`;

    const invited = await ctx.post("/api/members/invite", {
      headers: bearer(temp.accessToken),
      data: { email, name: "Invitee", role: "MEMBER" },
    });
    expect(invited.status()).toBe(201);
    const invitedBody = await invited.json();
    expect(invitedBody.member.email).toBe(email);
    expect(invitedBody.member.status).toBe("ACTIVE");
    expect(typeof invitedBody.tempPassword).toBe("string");

    const listed = await ctx.get("/api/members", { headers: bearer(temp.accessToken) });
    expect((await listed.json()).seats.used).toBe(2);

    const removed = await ctx.delete(`/api/members/${invitedBody.member.id}`, {
      headers: bearer(temp.accessToken),
    });
    expect(removed.status()).toBe(200);

    const after = await ctx.get("/api/members", { headers: bearer(temp.accessToken) });
    expect((await after.json()).seats.used).toBe(1);
  });

  test("inviting beyond the plan's seats fails with SEAT_LIMIT_REACHED", async () => {
    const temp = await provisionTenant(ctx, "members-limit");
    await setPlan(ctx, temp.accessToken, "FREE"); // 3 seats

    for (const n of [1, 2]) {
      const res = await ctx.post("/api/members/invite", {
        headers: bearer(temp.accessToken),
        data: { email: `seat-${n}-${Date.now().toString(36)}@e2e.test`, role: "MEMBER" },
      });
      expect(res.status(), `invite ${n}`).toBe(201);
    }

    const blocked = await ctx.post("/api/members/invite", {
      headers: bearer(temp.accessToken),
      data: { email: `seat-3-${Date.now().toString(36)}@e2e.test`, role: "MEMBER" },
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe("SEAT_LIMIT_REACHED");
  });

  test("owners cannot be removed by non-owners and self-mutation is blocked", async () => {
    const temp = await provisionTenant(ctx, "members-roles");
    const invited = await ctx.post("/api/members/invite", {
      headers: bearer(temp.accessToken),
      data: { email: `admin-${Date.now().toString(36)}@e2e.test`, role: "ADMIN" },
    });
    const { member, tempPassword } = await invited.json();

    const peer = await ctx.post("/api/members/invite", {
      headers: bearer(temp.accessToken),
      data: { email: `peer-${Date.now().toString(36)}@e2e.test`, role: "MEMBER" },
    });
    const peerBody = await peer.json();

    const login = await ctx.post("/api/auth/login", {
      data: { email: member.email, password: tempPassword, tenantSlug: temp.tenant.slug },
    });
    expect(login.status()).toBe(200);
    const adminToken = (await login.json()).accessToken as string;

    const escalate = await ctx.patch(`/api/members/${peerBody.member.id}`, {
      headers: bearer(adminToken),
      data: { role: "OWNER" },
    });
    expect(escalate.status()).toBe(403);
    expect((await escalate.json()).code).toBe("ROLE_ESCALATION");

    const selfRemove = await ctx.delete(`/api/members/${member.id}`, { headers: bearer(adminToken) });
    expect(selfRemove.status()).toBe(403);
    expect((await selfRemove.json()).code).toBe("SELF_MUTATION");
  });
});
