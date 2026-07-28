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
import { MerchantAdminsAuthModule } from '../merchant-admins/merchant-admins-auth.module';

@Module({
  imports: [
    DatabaseModule,
    CustomersAuthModule,
    OAuthModule,
    MerchantAdminsAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude(
        // Platform-domain route, not a tenant subdomain — Google can only be
        // given one callback URL, so this one resolves its tenant from the
        // signed OAuth state instead (see GoogleOAuthController#callback).
        { path: 'auth/google/callback', method: RequestMethod.GET },
        // Root/liveness route. It touches no tenant data, and load-balancer
        // and container health probes hit it by IP or internal DNS name,
        // which resolves to no registered tenant host — leaving it behind
        // the middleware makes every probe 404 with "Unknown tenant".
        { path: '/', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
