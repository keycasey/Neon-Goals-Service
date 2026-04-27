import { Module, forwardRef } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatContextBridgeService } from './chat-context-bridge.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, forwardRef(() => AiModule)],
  controllers: [ChatsController],
  providers: [ChatsService, ChatContextBridgeService],
  exports: [ChatsService, ChatContextBridgeService],
})
export class ChatsModule {}
