import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService } from './database.service';
@Global()
@Module({})
export class DatabaseModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: APP_CONFIG, useValue: config }, DatabaseService],
      exports: [APP_CONFIG, DatabaseService],
    };
  }
}
