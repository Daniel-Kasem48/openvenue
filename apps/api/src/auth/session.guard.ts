import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@openvenue/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { fail } from '../common/errors';
import { AuthService } from './auth.service';
import type { Principal } from './credentials';
export interface AuthenticatedRequest extends Request {
  principal: Principal;
}
const ROLE_KEY = 'openvenue:roles';
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    context.switchToHttp().getResponse<Response>().set('Cache-Control', 'no-store');
    const principal = await this.auth.authenticate(req.cookies?.ov_session);
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? ['owner', 'manager'];
    if (!roles.includes(principal.role))
      fail(403, 'Your account does not have permission for this action.');
    req.principal = principal;
    return true;
  }
}
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(ROLE_KEY, roles), UseGuards(SessionGuard));
@Injectable()
export class ArchiveGuard extends SessionGuard {
  async canActivate(context: ExecutionContext) {
    const query = z
      .object({ includeArchived: z.enum(['0', '1']).optional() })
      .parse(context.switchToHttp().getRequest<Request>().query);
    return query.includeArchived === '1' ? super.canActivate(context) : true;
  }
}
