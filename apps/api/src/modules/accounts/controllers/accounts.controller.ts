import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles, type AuthenticatedRequest } from '../../auth/guards/session.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createAccountSchema,
  updateAccountSchema,
  type CreateAccountDto,
  type UpdateAccountDto,
} from '../dto/accounts.dto';
import { UuidPipe } from '../../../common/pipes/uuid.pipe';
import { AccountsService } from '../services/accounts.service';

@Controller('users')
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly service: AccountsService) {}
  @Get() @Roles('owner') list() {
    return this.service.list();
  }
  @Post() @Roles('owner') create(
    @Body(new ZodValidationPipe(createAccountSchema)) input: CreateAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(input, req.principal, req.cookies.ov_session);
  }
  @Patch(':id') @Roles('owner') update(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) input: UpdateAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, input, req.principal);
  }
}
