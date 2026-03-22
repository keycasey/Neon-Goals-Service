import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProjectionsService } from './projections.service';

@Controller('manual-financial-accounts')
@UseGuards(JwtAuthGuard)
export class ManualFinancialAccountsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get()
  getAll(@Req() req: any) {
    return this.projectionsService.getManualAccounts(req.user.userId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      type: 'cash' | 'investment' | 'retirement' | 'property' | 'other';
      balance: number;
      isDebt: boolean;
      currency: string;
    },
  ) {
    return this.projectionsService.createManualAccount(req.user.userId, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.projectionsService.deleteManualAccount(req.user.userId, id);
  }
}

@Controller('manual-cashflows')
@UseGuards(JwtAuthGuard)
export class ManualCashflowsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get()
  getAll(@Req() req: any) {
    return this.projectionsService.getManualCashflows(req.user.userId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      label: string;
      amount: number;
      type: 'income' | 'expense';
      cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
      category?: string;
    },
  ) {
    return this.projectionsService.createManualCashflow(req.user.userId, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.projectionsService.deleteManualCashflow(req.user.userId, id);
  }
}
