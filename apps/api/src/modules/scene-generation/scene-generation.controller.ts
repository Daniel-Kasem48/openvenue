import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/session.guard';
import { SceneRateLimitGuard } from '../../common/rate-limit.guard';
import { UuidPipe } from '../../common/uuid.pipe';
import { SceneGenerationService } from './scene-generation.service';

@Controller('venues/:id')
export class SceneGenerationController {
  constructor(@Inject(SceneGenerationService) private readonly service: SceneGenerationService) {}
  @Post('generate-scene')
  @HttpCode(200)
  @UseGuards(SceneRateLimitGuard)
  @Roles('owner', 'manager')
  generate(@Param('id', UuidPipe) id: string, @Body() input: unknown) {
    return this.service.generate(id, input);
  }
}
