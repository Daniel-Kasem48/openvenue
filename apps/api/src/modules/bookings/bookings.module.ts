import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { BookingsController } from './controllers/bookings.controller';
import { BookingsService } from './services/bookings.service';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingRateLimitGuard],
})
export class BookingsModule {}
