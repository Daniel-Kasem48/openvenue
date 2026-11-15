import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles } from '../../auth/guards/session.guard';
import { overviewRangeSchema, type OverviewRangeDto } from '../dto/overview.dto';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { OverviewService } from '../services/overview.service';

@Controller('overview')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly service: OverviewService) {}
  @Get() @Roles('owner', 'manager') get(
    @Query(new ZodValidationPipe(overviewRangeSchema)) query: OverviewRangeDto,
  ) {
    return this.service.get(query);
  }
}
