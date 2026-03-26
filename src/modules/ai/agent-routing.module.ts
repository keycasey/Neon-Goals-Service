import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { AgentRoutingService } from './agent-routing.service';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    AuthModule,
  ],
  providers: [AgentRoutingService],
  exports: [AgentRoutingService],
})
export class AgentRoutingModule {}
