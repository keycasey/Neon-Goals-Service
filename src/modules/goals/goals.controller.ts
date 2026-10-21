import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { ScraperService } from '../scraper/scraper.service';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CandidateUrlDto,
  CreateActionGoalDto,
  CreateFinanceGoalDto,
  CreateGroupGoalDto,
  CreateItemGoalDto,
  TaskDto,
  UpdateTaskDto,
  UpdateActionGoalDto,
  UpdateFinanceGoalDto,
  UpdateGoalDto,
  UpdateGroupGoalDto,
  UpdateItemGoalDto,
} from './dto';

@Controller('goals')
@UseGuards(JwtOrApiKeyGuard)  // Allow either JWT or API key auth
export class GoalsController {
  constructor(
    private goalsService: GoalsService,
    private scraperService: ScraperService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const filters: { type?: 'item' | 'finance' | 'action' | 'group'; status?: 'active' | 'completed' | 'archived' } = {};
    if (type && ['item', 'finance', 'action', 'group'].includes(type)) {
      filters.type = type as 'item' | 'finance' | 'action' | 'group';
    }
    if (status && ['active', 'completed', 'archived'].includes(status)) {
      filters.status = status as 'active' | 'completed' | 'archived';
    }
    return this.goalsService.findAll(userId, filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.goalsService.findOne(id, userId);
  }

  @Post('item')
  async createItemGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: CreateItemGoalDto,
  ) {
    return this.goalsService.createItemGoal(userId, data);
  }

  @Post('finance')
  async createFinanceGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: CreateFinanceGoalDto,
  ) {
    return this.goalsService.createFinanceGoal(userId, data);
  }

  @Post('action')
  async createActionGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: CreateActionGoalDto,
  ) {
    return this.goalsService.createActionGoal(userId, data);
  }

  @Post('group')
  async createGroupGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: CreateGroupGoalDto,
  ) {
    return this.goalsService.createGroupGoal(userId, data);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateGoalDto,
  ) {
    return this.goalsService.update(id, userId, data);
  }

  @Patch(':id/item')
  async updateItemGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateItemGoalDto,
  ) {
    return this.goalsService.updateItemGoal(id, userId, data);
  }

  @Patch(':id/finance')
  async updateFinanceGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateFinanceGoalDto,
  ) {
    return this.goalsService.updateFinanceGoal(id, userId, data);
  }

  @Patch(':id/action')
  async updateActionGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateActionGoalDto,
  ) {
    return this.goalsService.updateActionGoal(id, userId, data);
  }

  @Patch(':id/group')
  async updateGroupGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateGroupGoalDto,
  ) {
    return this.goalsService.updateGroupGoal(id, userId, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.goalsService.delete(id, userId);
  }

  @Patch(':id/archive')
  async archive(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.goalsService.archive(id, userId);
  }

  // Task endpoints
  @Post(':id/tasks')
  async createTask(
    @Param('id') goalId: string,
    @CurrentUser('userId') userId: string,
    @Body() data: TaskDto,
  ) {
    return this.goalsService.createTask(goalId, userId, data);
  }

  @Patch(':id/tasks/:taskId/toggle')
  async toggleTask(
    @Param('id') goalId: string,
    @Param('taskId') taskId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.toggleTask(goalId, taskId, userId);
  }

  @Patch(':id/tasks/:taskId')
  async updateTask(
    @Param('id') goalId: string,
    @Param('taskId') taskId: string,
    @CurrentUser('userId') userId: string,
    @Body() data: UpdateTaskDto,
  ) {
    return this.goalsService.updateTask(goalId, taskId, userId, data);
  }

  @Delete(':id/tasks/:taskId')
  async deleteTask(
    @Param('id') goalId: string,
    @Param('taskId') taskId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.deleteTask(goalId, taskId, userId);
  }

  // Candidate management endpoints
  @Post(':id/deny-candidate')
  async denyCandidate(
    @Param('id') goalId: string,
    @Body() body: CandidateUrlDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.denyCandidate(goalId, userId, body.candidateUrl);
  }

  @Post(':id/restore-candidate')
  async restoreCandidate(
    @Param('id') goalId: string,
    @Body() body: CandidateUrlDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.restoreCandidate(goalId, userId, body.candidateUrl);
  }

  @Get(':id/denied-candidates')
  async getDeniedCandidates(
    @Param('id') goalId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.getDeniedCandidates(goalId, userId);
  }

  /**
   * Refresh product candidates for an item goal
   * Queues a scraping job (camoufox → browser-use fallback)
   */
  @Post(':id/refresh-candidates')
  async refreshCandidates(
    @Param('id') goalId: string,
    @CurrentUser('userId') userId: string,
  ) {
    // Verify goal exists and belongs to user
    const goal = await this.goalsService.findOne(goalId, userId);

    if (goal.type !== 'item') {
      throw new Error('Can only refresh candidates for item goals');
    }

    // Queue scraping job - will be processed by cron worker
    await this.scraperService.queueCandidateAcquisition(goalId);

    return {
      message: 'Scraping job queued successfully',
      goalId,
      note: 'Candidates will be updated within 2 minutes',
    };
  }

  /**
   * Get scrape jobs for a goal (for polling status)
   */
  @Get(':id/scrape-jobs')
  async getScrapeJobs(
    @Param('id') goalId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.getScrapeJobs(goalId, userId);
  }
}
