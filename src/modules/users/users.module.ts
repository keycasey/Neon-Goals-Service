import { Module } from '@nestjs/common';
import { OpenAIModule } from '../ai/openai/openai.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OpenAIModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
