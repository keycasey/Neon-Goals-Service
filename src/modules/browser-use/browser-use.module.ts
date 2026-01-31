import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrowserUseController } from './browser-use.controller';
import { BrowserUseService } from './browser-use.service';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BrowserUseController],
  providers: [BrowserUseService],
  exports: [BrowserUseService],
})
export class BrowserUseModule {}
