import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../db/database.module';
import { TenantResolutionMiddleware } from '../tenancy/tenant-resolution.middleware';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [DatabaseModule, CustomersAuthModule, OAuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude({ path: 'auth/google/callback', method: RequestMethod.GET })
      .forRoutes('*');
  }
}
