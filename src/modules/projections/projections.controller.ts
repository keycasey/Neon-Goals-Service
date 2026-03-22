import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProjectionsService } from './projections.service';

@Controller('projections')
@UseGuards(JwtAuthGuard)
export class ProjectionsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get('overview')
  getOverview(@Query('horizon') horizon?: string) {
    return this.projectionsService.getOverview(Number(horizon) || 12);
  }

  @Get('cashflow')
  getCashflow(@Req() req: any) {
    return this.projectionsService.getCashflow(req.user.userId);
  }

  @Post('forecast')
  getForecast(@Req() req: any, @Body() body: { horizon?: number }) {
    return this.projectionsService.getForecast(req.user.userId, body?.horizon ?? 12);
  }

  @Post('scenario')
  runScenario(
    @Req() req: any,
    @Body()
    body: {
      horizon?: number;
      monthlySavingsIncrease?: number;
      diningReduction?: number;
      subscriptionReduction?: number;
      incomeAdjustment?: number;
    },
  ) {
    return this.projectionsService.runScenario(req.user.userId, body?.horizon ?? 12, body ?? {});
  }
}
