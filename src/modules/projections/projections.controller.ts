import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProjectionsService } from './projections.service';
import { ForecastDto, HorizonQueryDto, RecurringMergeDto, ScenarioDto } from './dto';

@Controller('projections')
@UseGuards(JwtAuthGuard)
export class ProjectionsController {
  constructor(private readonly projectionsService: ProjectionsService) {}

  @Get('overview')
  getOverview(@Req() req: any, @Query() query: HorizonQueryDto) {
    return this.projectionsService.getOverview(req.user.userId, query.horizon);
  }

  @Get('cashflow')
  getCashflow(@Req() req: any) {
    return this.projectionsService.getCashflow(req.user.userId);
  }

  @Post('forecast')
  getForecast(@Req() req: any, @Body() body: ForecastDto) {
    return this.projectionsService.getForecast(req.user.userId, body.horizon);
  }

  @Post('scenario')
  runScenario(
    @Req() req: any,
    @Body()
    body: ScenarioDto,
  ) {
    return this.projectionsService.runScenario(req.user.userId, body?.horizon ?? 12, body ?? {});
  }

  @Post('cashflow/merge')
  mergeRecurringItems(
    @Req() req: any,
    @Body() body: RecurringMergeDto,
  ) {
    return this.projectionsService.mergeRecurringItems(
      req.user.userId,
      body.targetItemId,
      body.sourceItemId,
      body.direction,
    );
  }

  @Post('cashflow/unmerge')
  unmergeRecurringItems(
    @Req() req: any,
    @Body() body: RecurringMergeDto,
  ) {
    return this.projectionsService.unmergeRecurringItems(
      req.user.userId,
      body.targetItemId,
      body.sourceItemId,
      body.direction,
    );
  }
}
