import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, Public } from "../common/decorators.ts";
import { zodPipe } from "../common/zod.pipe.ts";
import type { RequestUser } from "../common/request-types.ts";
import { AuthService, LoginSchema, SignupSchema, type LoginInput, type SignupInput } from "./auth.service.ts";
import { REFRESH_COOKIE, TokenService } from "./token.service.ts";

function refreshCookie(req: FastifyRequest): string | undefined {
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}

function meta(req: FastifyRequest): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers["user-agent"], ip: req.ip };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post("signup")
  @HttpCode(201)
  async signup(
    @Body(zodPipe(SignupSchema)) body: SignupInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { bundle, tokens } = await this.auth.signup(body, meta(req));
    this.tokens.setRefreshCookie(reply, tokens);
    return { ...bundle, accessToken: tokens.accessToken };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(zodPipe(LoginSchema)) body: LoginInput,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { bundle, tokens } = await this.auth.login(body, meta(req));
    this.tokens.setRefreshCookie(reply, tokens);
    return { ...bundle, accessToken: tokens.accessToken };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const raw = refreshCookie(req);
    if (!raw) {
      this.tokens.clearRefreshCookie(reply);
      throw new UnauthorizedException({ message: "No refresh token", code: "NO_REFRESH_TOKEN" });
    }
    const result = await this.auth.refresh(raw, meta(req));
    if (!result) {
      this.tokens.clearRefreshCookie(reply);
      throw new UnauthorizedException({ message: "Session expired — please sign in again", code: "REFRESH_INVALID" });
    }
    this.tokens.setRefreshCookie(reply, result.tokens);
    return { ...result.bundle, accessToken: result.tokens.accessToken };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const raw = refreshCookie(req);
    if (raw) await this.tokens.revokeFamilyOf(raw);
    this.tokens.clearRefreshCookie(reply);
    return { ok: true };
  }

  @Post("switch")
  @HttpCode(200)
  async switchTenant(
    @CurrentUser() user: RequestUser,
    @Body(zodPipe(z.object({ tenantSlug: z.string().min(1).max(60) }))) body: { tenantSlug: string },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { bundle, tokens } = await this.auth.switchTenant(user.id, body.tenantSlug, meta(req));
    const old = refreshCookie(req);
    if (old) await this.tokens.revokeFamilyOf(old);
    this.tokens.setRefreshCookie(reply, tokens);
    return { ...bundle, accessToken: tokens.accessToken };
  }

  @Get("me")
  async me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }
}
