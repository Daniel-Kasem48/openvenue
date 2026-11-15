import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import { APP_CONFIG, type AppConfig } from '../config';
import { entities } from './entities';
import { initialize } from './queries';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private orm?: MikroORM;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  get em(): EntityManager {
    if (!this.orm) throw new Error('Database is not initialized');
    // Each operation owns an identity map; transactional callbacks share their fork.
    return this.orm.em.fork();
  }
  async onModuleInit() {
    this.orm = await MikroORM.init({ clientUrl: this.config.databaseUrl, entities });
    try {
      await initialize(this.em);
    } catch (error) {
      await this.onApplicationShutdown();
      throw error;
    }
  }
  async onApplicationShutdown() {
    await this.orm?.close();
    this.orm = undefined;
  }
}
