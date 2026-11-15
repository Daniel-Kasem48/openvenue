import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { fail } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
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

    const venue = await this.db.pool.query('SELECT kind FROM venues WHERE id=$1', [id]);
    if (!venue.rowCount) fail(404, 'Venue not found');
    return await generateScene(prompt, venue.rows[0].kind, {
      apiKey: this.config.anthropicApiKey,
      model: this.config.anthropicModel,
    });
  }
}
