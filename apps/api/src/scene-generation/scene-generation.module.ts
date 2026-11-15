import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SceneRateLimitGuard } from '../common/rate-limit.guard';
import { SceneGenerationController } from './scene-generation.controller';
import { SceneGenerationService } from './scene-generation.service';

@Module({
  imports: [AuthModule],
  controllers: [SceneGenerationController],
  providers: [SceneGenerationService, SceneRateLimitGuard],
})
export class SceneGenerationModule {}
