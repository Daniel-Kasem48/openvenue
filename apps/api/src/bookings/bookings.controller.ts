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
import { bookingPatchSchema } from '@openvenue/contracts';
import type { Response } from 'express';
import { Roles, type AuthenticatedRequest } from '../auth/session.guard';
import { fail } from '../common/errors';
import { BookingRateLimitGuard } from '../common/rate-limit.guard';
import { UuidPipe } from '../common/uuid.pipe';
import { BookingsService } from './bookings.service';

@Controller('')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly service: BookingsService) {}
  @Get('venues/:id/availability') availability(
    @Param('id', UuidPipe) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.availability(id, query);
  }
  @Post('bookings') @UseGuards(BookingRateLimitGuard) create(@Body() input: unknown) {
    return this.service.create(input);
  }
  @Get('bookings') @Roles('owner', 'manager', 'staff') list(
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(query);
  }
  @Get('bookings.csv') @Roles('owner', 'manager', 'staff') async csv(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const csv = await this.service.csv(query);
    res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
    res.type('text/csv; charset=utf-8').send(csv);
  }
  @Patch('bookings/:id') @Roles('owner', 'manager', 'staff') update(
    @Param('id', UuidPipe) id: string,
    @Body() input: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const body = bookingPatchSchema.parse(input);
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
