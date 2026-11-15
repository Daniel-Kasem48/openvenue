import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SceneRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { SceneGenerationController } from './controllers/scene-generation.controller';
import { SceneGenerationService } from './services/scene-generation.service';

@Module({
  imports: [AuthModule],
  controllers: [SceneGenerationController],
  providers: [SceneGenerationService, SceneRateLimitGuard],
})
export class SceneGenerationModule {}
