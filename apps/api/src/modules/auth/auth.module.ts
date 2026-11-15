import { Module } from '@nestjs/common';
import { LoginRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { ArchiveGuard, SessionGuard } from './guards/session.guard';
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, ArchiveGuard, LoginRateLimitGuard],
  exports: [AuthService, SessionGuard, ArchiveGuard],
})
export class AuthModule {}
