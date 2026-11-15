import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  eventSchema,
  eventPricingSchema,
  blockSeatsSchema,
  releaseSeatsSchema,
  type EventDto,
  type EventPricingDto,
  type BlockSeatsDto,
  type ReleaseSeatsDto,
} from '../dto/events.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Roles, type AuthenticatedRequest } from '../../auth/guards/session.guard';
import { UuidPipe } from '../../../common/pipes/uuid.pipe';
import { EventsService } from '../services/events.service';

@Controller('venues/:id')
export class EventsController {
  constructor(@Inject(EventsService) private readonly service: EventsService) {}
  @Get('shows') listShows(@Param('id', UuidPipe) id: string) {
    return this.service.listShows(id);
  }
  @Get('events') @Roles('owner', 'manager') listEvents(@Param('id', UuidPipe) id: string) {
    return this.service.listEvents(id);
  }
  @Post('shows') @Roles('owner', 'manager') create(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(eventSchema)) input: EventDto,
  ) {
    return this.service.create(id, input);
  }
  @Get('shows/:showId/pricing') @Roles('owner', 'manager') getPricing(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
  ) {
    return this.service.getPricing(id, eventId);
  }
  @Put('shows/:showId/pricing') @Roles('owner', 'manager') setPricing(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Body(new ZodValidationPipe(eventPricingSchema)) input: EventPricingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.setPricing(id, eventId, input, req.principal);
  }
  @Put('shows/:showId') @Roles('owner', 'manager') update(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Body(new ZodValidationPipe(eventSchema)) input: EventDto,
  ) {
    return this.service.update(id, eventId, input);
  }
  @Get('shows/:showId/blocks') @Roles('owner', 'manager') listBlocks(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
  ) {
    return this.service.listBlocks(id, eventId);
  }
  @Post('shows/:showId/blocks') @Roles('owner', 'manager') blockSeats(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Body(new ZodValidationPipe(blockSeatsSchema)) input: BlockSeatsDto,
  ) {
    return this.service.blockSeats(id, eventId, input);
  }
  @Delete('shows/:showId/blocks') @Roles('owner', 'manager') releaseSeats(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Body(new ZodValidationPipe(releaseSeatsSchema)) input: ReleaseSeatsDto,
  ) {
    return this.service.releaseSeats(id, eventId, input);
  }
  @Delete('shows/:showId') @HttpCode(200) @Roles('owner', 'manager') remove(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(id, eventId, false, req.principal);
  }
  @Post('shows/:showId/cancel') @HttpCode(200) @Roles('owner', 'manager') cancel(
    @Param('id', UuidPipe) id: string,
    @Param('showId', UuidPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(id, eventId, true, req.principal);
  }
}
