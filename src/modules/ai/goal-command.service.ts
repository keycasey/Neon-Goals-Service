import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ScraperService } from '../scraper/scraper.service';

export interface ExecutedCommand {
  type: string;
  success: boolean;
  goalId?: string;
  subgoalId?: string;
  goal?: any;
  subgoal?: any;
  error?: string;
}

/**
 * Shared service for executing AI-generated goal commands.
 * Extracted from AiGoalCreationController and AiOverviewController to eliminate duplication.
 */
@Injectable()
export class GoalCommandService {
  private readonly logger = new Logger(GoalCommandService.name);

  constructor(
    private prisma: PrismaService,
    private scraperService: ScraperService,
  ) {}

  /**
   * Execute parsed commands to create/update goals
   * Returns executed commands with their results
   */
  async executeCommands(userId: string, commands: any[]): Promise<ExecutedCommand[]> {
    const executedCommands: ExecutedCommand[] = [];

    for (const command of commands) {
      try {
        if (command.type === 'CREATE_GOAL') {
          const goal = await this.createGoal(userId, command.data);
          executedCommands.push({
            type: 'CREATE_GOAL',
            success: true,
            goalId: goal.id,
            goal,
          });
        } else if (command.type === 'CREATE_SUBGOAL') {
          const subgoal = await this.createSubgoal(userId, command.data);
          executedCommands.push({
            type: 'CREATE_SUBGOAL',
            success: true,
            subgoalId: subgoal.id,
            subgoal,
          });
        } else if (command.type === 'UPDATE_PROGRESS') {
          await this.updateProgress(userId, command.data);
          executedCommands.push({
            type: 'UPDATE_PROGRESS',
            success: true,
            goalId: command.data.goalId,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to execute command ${command.type}:`, error);
        executedCommands.push({
          type: command.type,
          success: false,
          error: error.message,
        });
      }
    }

    return executedCommands;
  }

  /**
   * Create a new main goal from command data
   */
  async createGoal(userId: string, data: any) {
    const { type, title, description, tasks, deadline } = data;

    // Convert deadline string to Date object if provided
    const deadlineDate = deadline ? new Date(deadline) : null;

    if (type === 'action') {
      return this.prisma.goal.create({
        data: {
          type: 'action',
          title,
          description: description || `Working on: ${title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          actionData: {
            create: {
              completionPercentage: 0,
              motivation: null,
              tasks: tasks ? {
                create: tasks.map((t: any) => ({
                  title: t.title || t,
                  completed: false,
                })),
              } : undefined,
            },
          },
        },
        include: {
          actionData: {
            include: {
              tasks: true,
            },
          },
        },
      });
    }

    // For item/finance goals, create with minimal defaults
    if (type === 'item') {
      const goal = await this.prisma.goal.create({
        data: {
          type: 'item',
          title,
          description: description || `Saving for: ${title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          itemData: {
            create: {
              productImage: null,
              bestPrice: data.budget || 0,
              currency: 'USD',
              retailerUrl: '',
              retailerName: 'TBD',
              statusBadge: 'pending_search',
              searchTerm: data.searchTerm || null,
              category: data.category || null,
            },
          },
        },
        include: {
          itemData: true,
        },
      });

      // Queue scraping job - scraper service will determine if scrapers exist for this category
      await this.scraperService.queueCandidateAcquisition(goal.id);

      return goal;
    }

    if (type === 'finance') {
      return this.prisma.goal.create({
        data: {
          type: 'finance',
          title,
          description: description || `Financial goal: ${title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          financeData: {
            create: {
              institutionIcon: '🏦',
              accountName: 'Savings',
              currentBalance: 0,
              targetBalance: data.targetBalance || 1000,
              currency: 'USD',
              progressHistory: [0],
            },
          },
        },
        include: {
          financeData: true,
        },
      });
    }

    throw new Error(`Unknown goal type: ${type}`);
  }

  /**
   * Create a subgoal under a parent goal
   * parentGoalId can be either an actual ID or a title (will be looked up)
   */
  async createSubgoal(userId: string, data: any) {
    const { parentGoalId, type, title, description, deadline } = data;

    // Convert deadline string to Date object if provided
    const deadlineDate = deadline ? new Date(deadline) : null;

    // Find parent goal - try by ID first, then by title (for recently created goals)
    let parentGoal = await this.prisma.goal.findFirst({
      where: {
        id: parentGoalId,
        userId,
      },
    });

    // If not found by ID, try by title (in case agent used title instead of ID)
    if (!parentGoal) {
      parentGoal = await this.prisma.goal.findFirst({
        where: {
          title: parentGoalId,
          userId,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!parentGoal) {
      // Get available goals for better error message
      const availableGoals = await this.prisma.goal.findMany({
        where: {
          userId,
          status: 'active',
        },
        select: {
          id: true,
          title: true,
        },
      });

      const goalList = availableGoals.map(g => `- ${g.title} (ID: ${g.id})`).join('\n');

      throw new Error(
        `Parent goal not found: "${parentGoalId}"\n\n` +
        `Available goals:\n${goalList}\n\n` +
        `Tip: Use the goal's title or exact ID as parentGoalId`,
      );
    }

    // Create subgoal similar to createGoal but with parentGoalId
    if (type === 'action') {
      return this.prisma.goal.create({
        data: {
          type: 'action',
          title,
          description: description || `Step toward: ${parentGoal.title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          parentGoalId: parentGoal.id,
          actionData: {
            create: {
              completionPercentage: 0,
            },
          },
        },
        include: {
          actionData: true,
        },
      });
    }

    // Handle item subgoals (e.g., vehicle as part of a larger goal)
    if (type === 'item') {
      const subgoal = await this.prisma.goal.create({
        data: {
          type: 'item',
          title,
          description: description || `Item toward: ${parentGoal.title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          parentGoalId: parentGoal.id,
          itemData: {
            create: {
              productImage: null,
              bestPrice: 0,
              currency: 'USD',
              retailerUrl: '',
              retailerName: 'TBD',
              statusBadge: 'pending_search',
              searchTerm: data.searchTerm || null,
              category: data.category || null,
            },
          },
        },
        include: {
          itemData: true,
        },
      });

      // Queue scraping job - scraper service will determine if scrapers exist for this category
      await this.scraperService.queueCandidateAcquisition(subgoal.id);

      return subgoal;
    }

    // Handle finance subgoals
    if (type === 'finance') {
      return this.prisma.goal.create({
        data: {
          type: 'finance',
          title,
          description: description || `Savings toward: ${parentGoal.title}`,
          status: 'active',
          deadline: deadlineDate,
          userId,
          parentGoalId: parentGoal.id,
          financeData: {
            create: {
              institutionIcon: '🏦',
              accountName: 'Savings',
              currentBalance: 0,
              targetBalance: data.targetBalance || 1000,
              currency: 'USD',
              progressHistory: [0],
            },
          },
        },
        include: {
          financeData: true,
        },
      });
    }

    throw new Error(`Subgoal type ${type} not yet implemented`);
  }

  /**
   * Update goal progress
   */
  async updateProgress(userId: string, data: any) {
    const { goalId, completionPercentage } = data;

    const goal = await this.prisma.goal.findFirst({
      where: {
        id: goalId,
        userId,
      },
    });

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    if (goal.type === 'action') {
      await this.prisma.actionGoalData.update({
        where: { goalId },
        data: { completionPercentage },
      });
    }

    // For other types, implement as needed
  }
}
