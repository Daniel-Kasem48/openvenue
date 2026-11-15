import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccountsModule } from './accounts/accounts.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import type { AppConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { OverviewModule } from './overview/overview.module';
import { SceneGenerationModule } from './scene-generation/scene-generation.module';
import { VenuesModule } from './venues/venues.module';
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot(config),
        AuthModule,
        AccountsModule,
        VenuesModule,
        EventsModule,
        BookingsModule,
        OverviewModule,
        SceneGenerationModule,
      ],
      controllers: [AppController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    };
  }
}
