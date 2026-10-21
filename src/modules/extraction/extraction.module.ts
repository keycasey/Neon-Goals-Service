import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProductExtractionService } from './product-extraction.service';
import { ExtractionController } from './extraction.controller';
import { PrismaService } from '../../config/prisma.service';
import { WorkerAuthGuard } from '../../common/guards/worker-auth.guard';

@Module({
  imports: [
    HttpModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [ExtractionController],
  providers: [ProductExtractionService, PrismaService, WorkerAuthGuard],
  exports: [ProductExtractionService],
})
export class ExtractionModule {}
