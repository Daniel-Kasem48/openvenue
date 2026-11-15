import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VenuesController } from './controllers/venues.controller';
import { VenuesService } from './services/venues.service';

@Module({
  imports: [AuthModule],
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [],
})
export class VenuesModule {}
