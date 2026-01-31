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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const filters: { type?: 'item' | 'finance' | 'action'; status?: 'active' | 'completed' | 'archived' } = {};
    if (type && ['item', 'finance', 'action'].includes(type)) {
      filters.type = type as 'item' | 'finance' | 'action';
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
    @Body() data: any,
  ) {
    return this.goalsService.createItemGoal(userId, data);
  }

  @Post('finance')
  async createFinanceGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.createFinanceGoal(userId, data);
  }

  @Post('action')
  async createActionGoal(
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.createActionGoal(userId, data);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.update(id, userId, data);
  }

  @Patch(':id/item')
  async updateItemGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.updateItemGoal(id, userId, data);
  }

  @Patch(':id/finance')
  async updateFinanceGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.updateFinanceGoal(id, userId, data);
  }

  @Patch(':id/action')
  async updateActionGoal(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() data: any,
  ) {
    return this.goalsService.updateActionGoal(id, userId, data);
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
    @Body() data: { title: string },
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
    @Body('candidateUrl') candidateUrl: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.denyCandidate(goalId, userId, candidateUrl);
  }

  @Post(':id/restore-candidate')
  async restoreCandidate(
    @Param('id') goalId: string,
    @Body('candidateUrl') candidateUrl: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.restoreCandidate(goalId, userId, candidateUrl);
  }

  @Get(':id/denied-candidates')
  async getDeniedCandidates(
    @Param('id') goalId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.goalsService.getDeniedCandidates(goalId, userId);
  }
}
