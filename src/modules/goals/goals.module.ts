import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { ScraperModule } from '../scraper/scraper.module';
import { AuthModule } from '../auth/auth.module';
import { GoalApplicationService } from './application/goal-application.service';

@Module({
  imports: [ScraperModule, AuthModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalApplicationService],
  exports: [GoalsService, GoalApplicationService],
})
export class GoalsModule {}
