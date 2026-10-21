import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlaidController } from './plaid.controller';
import { PlaidService } from './plaid.service';
import { PlaidSchedulerService } from './plaid-scheduler.service';
import { DemoPlaidService } from './demo-plaid.service';
import { PlaidTokenCipherService } from './plaid-token-cipher.service';

@Module({
  imports: [ConfigModule],
  controllers: [PlaidController],
  providers: [PlaidService, PlaidSchedulerService, DemoPlaidService, PlaidTokenCipherService],
  exports: [PlaidService, DemoPlaidService],
})
export class PlaidModule {}
