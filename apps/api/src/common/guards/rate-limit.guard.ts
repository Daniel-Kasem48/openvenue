import { HttpException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
class RateLimitGuard implements CanActivate {
  private readonly limiter;
  constructor(options: Partial<Options>) {
    this.limiter = rateLimit({
      ...options,
      handler: (_req, _res, next, options) => next(new HttpException(options.message, 429)),
    });
  }
  canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    return new Promise((resolve, reject) => {
      this.limiter(http.getRequest<Request>(), http.getResponse<Response>(), (error) =>
        error ? reject(error) : resolve(true),
      );
    });
  }
}
@Injectable()
export class LoginRateLimitGuard extends RateLimitGuard {
  constructor() {
    super({ windowMs: 15 * 60000, limit: 10, legacyHeaders: false });
  }
}
@Injectable()
export class BookingRateLimitGuard extends RateLimitGuard {
  constructor() {
    super({ windowMs: 60000, limit: 30, legacyHeaders: false });
  }
}
@Injectable()
export class SceneRateLimitGuard extends RateLimitGuard {
  constructor() {
    super({
      windowMs: 15 * 60000,
      limit: 5,
      legacyHeaders: false,
      message: { message: 'Too many scene generations. Please wait before trying again.' },
    });
  }
}
