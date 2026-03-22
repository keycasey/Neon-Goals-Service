import { Module } from '@nestjs/common';
import { ProjectionsController } from './projections.controller';
import { ManualCashflowsController, ManualFinancialAccountsController } from './manual-finance.controller';
import { ProjectionsService } from './projections.service';

@Module({
  controllers: [ProjectionsController, ManualFinancialAccountsController, ManualCashflowsController],
  providers: [ProjectionsService],
})
export class ProjectionsModule {}
