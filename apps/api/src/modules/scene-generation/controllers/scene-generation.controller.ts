import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { generateSceneSchema, type GenerateSceneDto } from '../dto/scene-generation.dto';
import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/guards/session.guard';
import { SceneRateLimitGuard } from '../../../common/guards/rate-limit.guard';
import { UuidPipe } from '../../../common/pipes/uuid.pipe';
import { SceneGenerationService } from '../services/scene-generation.service';

@Controller('venues/:id')
export class SceneGenerationController {
  constructor(@Inject(SceneGenerationService) private readonly service: SceneGenerationService) {}
  @Post('generate-scene')
  @HttpCode(200)
  @UseGuards(SceneRateLimitGuard)
  @Roles('owner', 'manager')
  generate(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(generateSceneSchema)) input: GenerateSceneDto,
  ) {
    return this.service.generate(id, input);
  }
}
