import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config';
import { initialize } from './queries';
@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly pool: Pool;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl });
  }
  async onModuleInit() {
    await initialize(this.pool);
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
