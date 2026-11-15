import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingRateLimitGuard } from '../common/rate-limit.guard';
import { EventsModule } from '../events/events.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingRateLimitGuard],
})
export class BookingsModule {}
