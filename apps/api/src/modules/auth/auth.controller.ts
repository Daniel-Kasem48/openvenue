import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { loginSchema } from '@openvenue/contracts';
import type { Request, Response } from 'express';
import { LoginRateLimitGuard } from '../../common/rate-limit.guard';
import { APP_CONFIG, type AppConfig } from '../../config';
import { AuthService } from './auth.service';
import { Roles, type AuthenticatedRequest } from './session.guard';
@Controller('auth')
export class AuthController {
  private readonly cookieOptions;
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: config.secureCookies,
      path: '/api',
      maxAge: 8 * 3600000,
    };
  }
  @Post('login')
  @HttpCode(200)
  @UseGuards(LoginRateLimitGuard)
  async login(@Body() input: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(input);
    res.cookie('ov_session', await this.auth.login(email, password), this.cookieOptions);
    return { authenticated: true };
  }
  @Get('me')
  @Roles('owner', 'manager', 'staff')
  me(@Req() req: AuthenticatedRequest) {
    const principal = req.principal;
    return {
      authenticated: true,
      role: principal.role,
      bootstrap: !principal.userId,
      user: principal.userId
        ? { id: principal.userId, name: principal.name, role: principal.role }
        : null,
    };
  }
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.ov_session);
    res.clearCookie('ov_session', this.cookieOptions);
    return { authenticated: false };
  }
}
