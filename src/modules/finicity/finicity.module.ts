import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinicityController } from './finicity.controller';
import { FinicityService } from './finicity.service';

@Module({
  imports: [ConfigModule],
  controllers: [FinicityController],
  providers: [FinicityService],
  exports: [FinicityService],
})
export class FinicityModule {}
