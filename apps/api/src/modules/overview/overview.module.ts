import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OverviewController } from './controllers/overview.controller';
import { OverviewService } from './services/overview.service';

@Module({
  imports: [AuthModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
