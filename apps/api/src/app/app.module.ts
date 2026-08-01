import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../db/database.module';
import { TenantResolutionMiddleware } from '../common/middleware/tenant-resolution.middleware';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { MerchantAdminsAuthModule } from '../merchant-admins/merchant-admins-auth.module';
import { ProductsModule } from '../products/products.module';
import { CartsModule } from '../carts/carts.module';
import { CustomerAddressesModule } from '../customer-addresses/customer-addresses.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrdersModule } from '../orders/orders.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { validate } from '../config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true, // main.ts already loads the repo-root .env via dotenv before Nest boots
      validate,
    }),
    DatabaseModule,
    CustomersAuthModule,
    OAuthModule,
    MerchantAdminsAuthModule,
    ProductsModule,
    CartsModule,
    CustomerAddressesModule,
    TenantSettingsModule,
    PaymentsModule,
    CheckoutModule,
    OrdersModule,
    SchedulerModule,
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
        // Global payment webhook route. Resolves tenancy from incoming signature/
        // merchant account ref and runs inside tenantDb.run(tenantId, ...).
        { path: 'v1/payments/webhook', method: RequestMethod.POST },
        { path: 'api/v1/payments/webhook', method: RequestMethod.POST },
        // Root/liveness route. It touches no tenant data, and load-balancer
        // and container health probes hit it by IP or internal DNS name,
        // which resolves to no registered tenant host — leaving it behind
        // the middleware makes every probe 404 with "Unknown tenant".
        { path: '/', method: RequestMethod.GET },
        // Swagger docs (main.ts only mounts these outside production). Not
        // tenant data, and accessed via the platform domain rather than a
        // tenant subdomain, so it would otherwise 404 with "Unknown tenant".
        // The wildcard covers the UI's static assets (swagger-ui-bundle.js,
        // swagger-ui-init.js, etc.), all served under the /docs prefix.
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/{*path}', method: RequestMethod.GET },
        { path: 'docs-json', method: RequestMethod.GET },
        { path: 'docs-yaml', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
