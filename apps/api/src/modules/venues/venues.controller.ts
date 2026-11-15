import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArchiveGuard, Roles, type AuthenticatedRequest } from '../auth/session.guard';
import { UuidPipe } from '../../common/uuid.pipe';
import { VenuesService } from './venues.service';

@Controller('venues')
export class VenuesController {
  constructor(@Inject(VenuesService) private readonly service: VenuesService) {}
  @Get() @UseGuards(ArchiveGuard) list(@Query() query: Record<string, unknown>) {
    return this.service.list(query);
  }
  @Post() @Roles('owner', 'manager') create(@Body() input: unknown) {
    return this.service.create(input);
  }
  @Patch(':id') @Roles('owner', 'manager') update(
    @Param('id', UuidPipe) id: string,
    @Body() input: unknown,
  ) {
    return this.service.update(id, input);
  }
  @Put(':id') @Roles('owner', 'manager') saveLayout(
    @Param('id', UuidPipe) id: string,
    @Body() input: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveLayout(id, input, req.principal);
  }
}
