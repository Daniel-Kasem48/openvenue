import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config';
import { DatabaseService } from './modules/database/database.service';
@Controller()
export class AppController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}
  @Get('public-config') publicConfig() {
    return { publicOrigin: this.config.publicOrigin ?? null };
  }
  @Get('health') async health() {
    await this.db.em.execute('SELECT 1');
    return { status: 'ok' };
  }
}
