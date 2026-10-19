import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CurrentTenant, CurrentUser, Roles } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestTenant, RequestUser } from "../common/request-types.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { PLANS } from "../billing/plans.ts";
import { AuthService } from "../auth/auth.service.ts";
import { pickAvatarColor } from "../common/avatar.ts";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "MEMBER"] as const;

const InviteSchema = z.object({
  email: z.email().max(160),
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(ROLES).default("MEMBER"),
});

const RoleSchema = z.object({ role: z.enum(ROLES) });

/**
 * Membership management. memberships is a control-plane table (cross-tenant
 * auth lookups depend on it), so these queries deliberately bypass tenantDb.
 * Last-owner protection and self-mutation guards live here (pattern #4).
 */
@Controller("members")
export class MembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@CurrentTenant() tenant: RequestTenant) {
    const rows = await this.prisma.membership.findMany({
      where: { tenantId: tenant.id },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    const used = rows.filter((r) => r.status !== "SUSPENDED").length;
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        avatarColor: row.user.avatarColor,
        role: row.role,
        status: row.status,
        joinedAt: row.createdAt.toISOString(),
      })),
      seats: { used, limit: PLANS[tenant.plan].seats },
    };
  }

  @Roles("OWNER", "ADMIN")
  @Post("invite")
  @HttpCode(201)
  async invite(
    @CurrentTenant() tenant: RequestTenant,
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(InviteSchema)) body: z.infer<typeof InviteSchema>,
  ) {
    if (body.role === "OWNER" && actor.role !== "OWNER") {
      throw new ForbiddenException({ message: "Only owners can grant the owner role", code: "ROLE_ESCALATION" });
    }
    const limit = PLANS[tenant.plan].seats;
    const used = await this.prisma.membership.count({
      where: { tenantId: tenant.id, status: { not: "SUSPENDED" } },
    });
    if (used >= limit) {
      throw new ForbiddenException({
        message: `Your plan includes ${limit} seats. Upgrade to invite more teammates.`,
        code: "SEAT_LIMIT_REACHED",
      });
    }

    const email = body.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let tempPassword: string | undefined;

    if (!user) {
      tempPassword = `Nx-${randomBytes(9).toString("base64url")}`;
      user = await this.prisma.user.create({
        data: {
          email,
          name: body.name ?? email.split("@")[0],
          passwordHash: await AuthService.hashPassword(tempPassword),
          avatarColor: pickAvatarColor(email),
        },
      });
    }

    const existing = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    });
    if (existing && existing.status !== "SUSPENDED") {
      throw new ConflictException({ message: "This person is already a member", code: "ALREADY_MEMBER" });
    }
    const membership = existing
      ? await this.prisma.membership.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", role: body.role },
        })
      : await this.prisma.membership.create({
          data: { tenantId: tenant.id, userId: user.id, role: body.role, status: "ACTIVE" },
        });

    return {
      member: {
        id: membership.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.createdAt.toISOString(),
      },
      tempPassword,
    };
  }

  @Roles("OWNER", "ADMIN")
  @Patch(":id")
  async changeRole(
    @CurrentTenant() tenant: RequestTenant,
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(RoleSchema)) body: z.infer<typeof RoleSchema>,
  ) {
    const membership = await this.findMembership(tenant.id, id);
    if (membership.userId === actor.id) {
      throw new ForbiddenException({ message: "You cannot change your own role", code: "SELF_MUTATION" });
    }
    if (body.role === "OWNER" && actor.role !== "OWNER") {
      throw new ForbiddenException({ message: "Only owners can grant the owner role", code: "ROLE_ESCALATION" });
    }
    if (membership.role === "OWNER" && body.role !== "OWNER") {
      await this.assertNotLastOwner(tenant.id, membership.id);
    }
    const updated = await this.prisma.membership.update({ where: { id }, data: { role: body.role } });
    return { ok: true, role: updated.role };
  }

  @Roles("OWNER", "ADMIN")
  @Delete(":id")
  async remove(
    @CurrentTenant() tenant: RequestTenant,
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ) {
    const membership = await this.findMembership(tenant.id, id);
    if (membership.userId === actor.id) {
      throw new ForbiddenException({ message: "You cannot remove yourself", code: "SELF_MUTATION" });
    }
    if (membership.role === "OWNER") await this.assertNotLastOwner(tenant.id, membership.id);
    if (actor.role === "ADMIN" && membership.role === "OWNER") {
      throw new ForbiddenException({ message: "Only owners can remove an owner", code: "ROLE_ESCALATION" });
    }
    await this.prisma.$transaction([
      this.prisma.membership.update({ where: { id }, data: { status: "SUSPENDED" } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: membership.userId, tenantId: tenant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  private async findMembership(tenantId: string, id: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id, tenantId } });
    if (!membership) throw new NotFoundException({ message: "Member not found", code: "MEMBER_NOT_FOUND" });
    return membership;
  }

  private async assertNotLastOwner(tenantId: string, excludingId: string) {
    const owners = await this.prisma.membership.count({
      where: { tenantId, role: "OWNER", status: "ACTIVE", id: { not: excludingId } },
    });
    if (owners === 0) {
      throw new ConflictException({
        message: "Every workspace needs at least one owner — promote another member first",
        code: "LAST_OWNER",
      });
    }
  }
}
