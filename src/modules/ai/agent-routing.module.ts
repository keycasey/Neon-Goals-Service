import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AgentAuthService } from '../auth/agent-auth.service';
import { AgentRoutingService } from './agent-routing.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [AgentAuthService, AgentRoutingService],
  exports: [AgentRoutingService],
})
export class AgentRoutingModule {}
