import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles } from '../auth/session.guard';
import { OverviewService } from './overview.service';

@Controller('overview')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly service: OverviewService) {}
  @Get() @Roles('owner', 'manager') get(@Query() query: Record<string, unknown>) {
    return this.service.get(query);
  }
}
