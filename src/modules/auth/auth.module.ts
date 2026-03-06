import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersModule } from '../users/users.module';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { AgentAuthService } from './agent-auth.service';
import { DemoResetService } from './demo-reset.service';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GithubStrategy, LocalStrategy, JwtOrApiKeyGuard, AgentAuthService, DemoResetService],
  exports: [AuthService, JwtOrApiKeyGuard, AgentAuthService, DemoResetService],
})
export class AuthModule {}
