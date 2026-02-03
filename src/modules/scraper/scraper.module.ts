import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { PrismaService } from '../../config/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [ScraperController],
  providers: [ScraperService, PrismaService],
  exports: [ScraperService],
})
export class ScraperModule {}
