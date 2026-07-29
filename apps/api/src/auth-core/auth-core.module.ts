import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HashingService } from './services/hashing.service';
import { TokenService } from './services/token.service';
import { OAuthStateService } from './services/oauth-state.service';
import { EnvironmentVariables } from '../config/env.validation';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [HashingService, TokenService, OAuthStateService],
  exports: [JwtModule, HashingService, TokenService, OAuthStateService],
})
export class AuthCoreModule {}
