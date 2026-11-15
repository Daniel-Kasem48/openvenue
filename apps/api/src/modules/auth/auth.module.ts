import { Module } from '@nestjs/common';
import { LoginRateLimitGuard } from '../../common/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ArchiveGuard, SessionGuard } from './session.guard';
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, ArchiveGuard, LoginRateLimitGuard],
  exports: [AuthService, SessionGuard, ArchiveGuard],
})
export class AuthModule {}
