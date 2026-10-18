import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { AuthModule } from '../auth/auth.module';
import { McpOAuthController } from './mcp-oauth.controller';

@Module({
  imports: [GoalsModule, AuthModule],
  controllers: [McpController, McpOAuthController],
  providers: [McpAuthGuard, McpServerFactory],
})
export class McpModule {}
