import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { fail } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
import { Venue } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { generateScene } from './generator';

@Injectable()
export class SceneGenerationService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  async generate(id: string, input: unknown) {
    const { prompt } = z.object({ prompt: z.string().trim().min(10).max(4000) }).parse(input);

    const venue = await this.db.em.getRepository(Venue).findOne({ id });
    if (!venue) fail(404, 'Venue not found');
    return await generateScene(prompt, venue.kind, {
      apiKey: this.config.anthropicApiKey,
      model: this.config.anthropicModel,
    });
  }
}
