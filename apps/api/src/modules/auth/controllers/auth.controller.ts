import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { loginSchema, type LoginDto } from '../dto/auth.dto';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { Request, Response } from 'express';
import { LoginRateLimitGuard } from '../../../common/guards/rate-limit.guard';
import { APP_CONFIG, type AppConfig } from '../../../config';
import { AuthService } from '../services/auth.service';
import { Roles, type AuthenticatedRequest } from '../guards/session.guard';
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
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password } = input;
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
