import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import type { AppConfig } from './config';
import { DatabaseModule } from './modules/database/database.module';
import { EventsModule } from './modules/events/events.module';
import { OverviewModule } from './modules/overview/overview.module';
import { SceneGenerationModule } from './modules/scene-generation/scene-generation.module';
import { VenuesModule } from './modules/venues/venues.module';
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
