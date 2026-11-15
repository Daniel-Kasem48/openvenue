import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles, type AuthenticatedRequest } from '../auth/session.guard';
import { UuidPipe } from '../common/uuid.pipe';
import { AccountsService } from './accounts.service';

@Controller('users')
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly service: AccountsService) {}
  @Get() @Roles('owner') list() {
    return this.service.list();
  }
  @Post() @Roles('owner') create(@Body() input: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.create(input, req.principal, req.cookies.ov_session);
  }
  @Patch(':id') @Roles('owner') update(
    @Param('id', UuidPipe) id: string,
    @Body() input: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, input, req.principal);
  }
}
