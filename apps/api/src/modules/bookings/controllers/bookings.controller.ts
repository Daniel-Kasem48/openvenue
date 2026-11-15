import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  bookingSchema,
  bookingPatchSchema,
  bookingFiltersSchema,
  availabilityQuerySchema,
  type CreateBookingDto,
  type UpdateBookingDto,
  type BookingFiltersDto,
  type AvailabilityQueryDto,
} from '../dto/bookings.dto';
import type { Response } from 'express';
import { Roles, type AuthenticatedRequest } from '../../auth/guards/session.guard';
import { fail } from '../../../common/errors';
import { BookingRateLimitGuard } from '../../../common/guards/rate-limit.guard';
import { UuidPipe } from '../../../common/pipes/uuid.pipe';
import { BookingsService } from '../services/bookings.service';

@Controller('')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly service: BookingsService) {}
  @Get('venues/:id/availability') availability(
    @Param('id', UuidPipe) id: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQueryDto,
  ) {
    return this.service.availability(id, query);
  }
  @Post('bookings') @UseGuards(BookingRateLimitGuard) create(
    @Body(new ZodValidationPipe(bookingSchema)) input: CreateBookingDto,
  ) {
    return this.service.create(input);
  }
  @Get('bookings') @Roles('owner', 'manager', 'staff') list(
    @Query(new ZodValidationPipe(bookingFiltersSchema)) query: BookingFiltersDto,
  ) {
    return this.service.list(query);
  }
  @Get('bookings.csv') @Roles('owner', 'manager', 'staff') async csv(
    @Query(new ZodValidationPipe(bookingFiltersSchema)) query: BookingFiltersDto,
    @Res() res: Response,
  ) {
    const csv = await this.service.csv(query);
    res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
    res.type('text/csv; charset=utf-8').send(csv);
  }
  @Patch('bookings/:id') @Roles('owner', 'manager', 'staff') update(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(bookingPatchSchema)) body: UpdateBookingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.principal.role === 'staff' && (body.notes !== undefined || body.status !== undefined))
      fail(403, 'Staff can only check reservations in or undo check-in.');
    return this.service.update(id, body, req.principal);
  }
  @Delete('bookings/:id') @Roles('owner', 'manager') async cancel(
    @Param('id', UuidPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.service.update(id, { status: 'cancelled' }, req.principal);
    return { cancelled: true };
  }
}
