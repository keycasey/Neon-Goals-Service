import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GoalType, GoalStatus } from '@prisma/client';
import { ScraperService } from '../scraper/scraper.service';
import { VehicleFilterService } from '../scraper/vehicle-filter.service';

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    private prisma: PrismaService,
    private scraperService: ScraperService,
    private vehicleFilterService: VehicleFilterService,
  ) {}

  async findAll(userId: string, filters?: { type?: GoalType; status?: GoalStatus }) {
    const where: any = { userId };

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;

    return this.prisma.goal.findMany({
      where,
      include: {
        itemData: true,
        financeData: true,
        actionData: {
          include: {
            tasks: true,
          },
        },
        groupData: true,
        subgoals: {
          include: {
            itemData: true,
            financeData: true,
            actionData: {
              include: {
                tasks: true,
              },
            },
            groupData: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        itemData: true,
        financeData: true,
        actionData: {
          include: {
            tasks: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        groupData: true,
        subgoals: {
          include: {
            itemData: true,
            financeData: true,
            actionData: {
              include: {
                tasks: true,
              },
            },
            groupData: true,
          },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    return goal;
  }

  async createItemGoal(userId: string, data: any) {
    const goal = await this.prisma.goal.create({
      data: {
        type: GoalType.item,
        title: data.title,
        description: data.description || `Looking for: ${data.title}`,
        status: data.status || GoalStatus.active,
        deadline: data.deadline ? new Date(data.deadline) : null,
        userId,
        itemData: {
          create: {
            productImage: data.productImage || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400',
            bestPrice: data.bestPrice || data.targetAmount || 0,
            currency: data.currency || 'USD',
            retailerUrl: data.retailerUrl || 'https://www.autotrader.com',
            retailerName: data.retailerName || 'AutoTrader',
            statusBadge: data.statusBadge || 'pending_search',
            searchResults: data.searchResults || null,
            candidates: data.candidates || null,
            deniedCandidates: data.deniedCandidates || null,
            shortlistedCandidates: data.shortlistedCandidates || null,
            selectedCandidateId: data.selectedCandidateId || null,
            stackId: data.stackId || null,
            stackOrder: data.stackOrder ?? null,
            searchTerm: data.searchTerm || null,
            category: data.category || null,
            searchFilters: data.searchFilters || null,
            retailerFilters: data.retailerFilters || null,
          },
        },
      },
      include: {
        itemData: true,
      },
    });

    // Queue candidate acquisition in background
    await this.scraperService.queueCandidateAcquisition(goal.id);

    return this.findOne(goal.id, userId);
  }

  async createFinanceGoal(userId: string, data: any) {
    const goal = await this.prisma.goal.create({
      data: {
        type: GoalType.finance,
        title: data.title,
        description: data.description,
        status: data.status || GoalStatus.active,
        deadline: data.deadline ? new Date(data.deadline) : null,
        userId,
        financeData: {
          create: {
            institutionIcon: data.institutionIcon,
            accountName: data.accountName,
            currentBalance: data.currentBalance,
            targetBalance: data.targetBalance,
            currency: data.currency || 'USD',
            progressHistory: data.progressHistory || [],
          },
        },
      },
      include: {
        financeData: true,
      },
    });

    return this.findOne(goal.id, userId);
  }

  async createActionGoal(userId: string, data: any) {
    const goal = await this.prisma.goal.create({
      data: {
        type: GoalType.action,
        title: data.title,
        description: data.description,
        status: data.status || GoalStatus.active,
        deadline: data.deadline ? new Date(data.deadline) : null,
        userId,
        actionData: {
          create: {
            completionPercentage: data.completionPercentage || 0,
            motivation: data.motivation,
            tasks: {
              create: (data.tasks || []).map((task: any) => ({
                ...task,
                scheduledFor: task.scheduledFor ? new Date(task.scheduledFor) : null,
              })),
            },
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

    return this.findOne(goal.id, userId);
  }

  async createGroupGoal(userId: string, data: any) {
    const goal = await this.prisma.goal.create({
      data: {
        type: GoalType.group,
        title: data.title,
        description: data.description,
        status: data.status || GoalStatus.active,
        deadline: data.deadline ? new Date(data.deadline) : null,
        userId,
        parentGoalId: data.parentGoalId,
        groupData: {
          create: {
            icon: data.icon,
            color: data.color,
            layout: data.layout || 'grid',
            progressType: data.progressType || 'average',
            progress: data.progress || 0,
          },
        },
      },
      include: {
        groupData: true,
        subgoals: {
          include: {
            itemData: true,
            financeData: true,
            actionData: {
              include: {
                tasks: true,
              },
            },
            groupData: true,
          },
        },
      },
    });

    return this.findOne(goal.id, userId);
  }

  async update(id: string, userId: string, data: any) {
    // Check if goal exists and belongs to user
    await this.findOne(id, userId);

    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
        deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
      },
    });

    return this.findOne(id, userId);
  }

  async updateItemGoal(id: string, userId: string, data: any) {
    const goal = await this.findOne(id, userId);

    // For vehicle goals, regenerate retailerFilters if searchTerm is being updated
    let retailerFilters = goal.itemData?.retailerFilters;
    const category = goal.itemData?.category;

    if (category === 'vehicle' && data.searchTerm && data.searchTerm !== goal.itemData?.searchTerm) {
      this.logger.log(`Vehicle goal searchTerm updated, regenerating retailer-specific filters from: "${data.searchTerm}"`);

      retailerFilters = await this.vehicleFilterService.parseQuery(data.searchTerm);

      if (retailerFilters) {
        this.logger.log(`Regenerated retailer-specific filters for ${Object.keys(retailerFilters.retailers || {}).length} retailers`);
      } else {
        this.logger.warn(`Failed to regenerate retailer filters, keeping existing ones`);
        retailerFilters = goal.itemData?.retailerFilters;
      }
    }

    await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
        },
      }),
      this.prisma.itemGoalData.update({
        where: { goalId: id },
        data: {
          productImage: data.productImage,
          bestPrice: data.bestPrice ?? data.targetAmount,
          currency: data.currency,
          retailerUrl: data.retailerUrl,
          retailerName: data.retailerName,
          statusBadge: data.statusBadge,
          searchResults: data.searchResults,
          searchTerm: data.searchTerm,
          category: data.category,
          searchFilters: data.searchFilters,
          retailerFilters,
          candidates: data.candidates !== undefined ? data.candidates : undefined,
          selectedCandidateId: data.selectedCandidateId !== undefined ? data.selectedCandidateId : undefined,
          shortlistedCandidates: data.shortlistedCandidates !== undefined ? data.shortlistedCandidates : undefined,
          deniedCandidates: data.deniedCandidates !== undefined ? data.deniedCandidates : undefined,
          stackId: data.stackId !== undefined ? data.stackId : undefined,
          stackOrder: data.stackOrder !== undefined ? data.stackOrder : undefined,
        },
      }),
    ]);

    return this.findOne(id, userId);
  }

  async updateFinanceGoal(id: string, userId: string, data: any) {
    await this.findOne(id, userId);

    await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
        },
      }),
      this.prisma.financeGoalData.update({
        where: { goalId: id },
        data: {
          institutionIcon: data.institutionIcon,
          accountName: data.accountName,
          currentBalance: data.currentBalance,
          targetBalance: data.targetBalance,
          currency: data.currency,
          progressHistory: data.progressHistory,
          lastSync: data.lastSync ? new Date(data.lastSync) : undefined,
        },
      }),
    ]);

    return this.findOne(id, userId);
  }

  async updateActionGoal(id: string, userId: string, data: any) {
    await this.findOne(id, userId);

    await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
        },
      }),
      this.prisma.actionGoalData.update({
        where: { goalId: id },
        data: {
          completionPercentage: data.completionPercentage,
          motivation: data.motivation,
        },
      }),
    ]);

    return this.findOne(id, userId);
  }

  async updateGroupGoal(id: string, userId: string, data: any) {
    await this.findOne(id, userId);

    const updateData: any = {};

    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.layout !== undefined) updateData.layout = data.layout;
    if (data.progressType !== undefined) updateData.progressType = data.progressType;
    if (data.progress !== undefined) updateData.progress = data.progress;

    await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
        },
      }),
      this.prisma.groupGoalData.update({
        where: { goalId: id },
        data: updateData,
      }),
    ]);

    return this.findOne(id, userId);
  }

  async delete(id: string, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.goal.delete({
      where: { id },
    });

    return { message: 'Goal deleted successfully' };
  }

  async archive(id: string, userId: string) {
    await this.findOne(id, userId);

    const goal = await this.prisma.goal.update({
      where: { id },
      data: { status: GoalStatus.archived },
    });

    return this.findOne(id, userId);
  }

  // Task operations for action goals
  async createTask(goalId: string, userId: string, data: { title: string; scheduledFor?: string }) {
    const goal = await this.findOne(goalId, userId);
    if (goal.type !== GoalType.action) {
      throw new NotFoundException('Goal is not an action goal');
    }

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        actionGoalId: goal.actionData?.id || '',
      },
    });

    // Recalculate completion percentage
    const allTasks = await this.prisma.task.findMany({
      where: { actionGoalId: goal.actionData?.id },
    });

    const completedCount = allTasks.filter(t => t.completed).length;
    const percentage = Math.round((completedCount / allTasks.length) * 100);

    await this.prisma.actionGoalData.update({
      where: { id: goal.actionData?.id },
      data: { completionPercentage: percentage },
    });

    return task;
  }

  async toggleTask(goalId: string, taskId: string, userId: string) {
    const goal = await this.findOne(goalId, userId);
    if (goal.type !== GoalType.action) {
      throw new NotFoundException('Goal is not an action goal');
    }

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.actionGoalId !== goal.actionData?.id) {
      throw new NotFoundException('Task not found');
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { completed: !task.completed },
    });

    // Recalculate completion percentage
    const allTasks = await this.prisma.task.findMany({
      where: { actionGoalId: goal.actionData?.id },
    });

    const completedCount = allTasks.filter(t => t.completed).length;
    const percentage = Math.round((completedCount / allTasks.length) * 100);

    await this.prisma.actionGoalData.update({
      where: { id: goal.actionData?.id },
      data: { completionPercentage: percentage },
    });

    return updated;
  }

  async updateTask(
    goalId: string,
    taskId: string,
    userId: string,
    data: { title?: string; completed?: boolean; scheduledFor?: string | null },
  ) {
    const goal = await this.findOne(goalId, userId);
    if (goal.type !== GoalType.action) {
      throw new BadRequestException('Goal is not an action goal');
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, actionGoalId: goal.actionData?.id },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (data.title === undefined && data.completed === undefined && data.scheduledFor === undefined) {
      throw new BadRequestException('No task changes supplied');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: data.title,
        completed: data.completed,
        scheduledFor:
          data.scheduledFor === undefined
            ? undefined
            : data.scheduledFor
              ? new Date(data.scheduledFor)
              : null,
      },
    });
    const allTasks = await this.prisma.task.findMany({
      where: { actionGoalId: goal.actionData?.id },
    });
    const percentage = allTasks.length
      ? Math.round((allTasks.filter((candidate) => candidate.completed).length / allTasks.length) * 100)
      : 0;
    await this.prisma.actionGoalData.update({
      where: { id: goal.actionData?.id },
      data: { completionPercentage: percentage },
    });
    return this.findOne(goalId, userId);
  }

  async deleteTask(goalId: string, taskId: string, userId: string) {
    const goal = await this.findOne(goalId, userId);
    if (goal.type !== GoalType.action) {
      throw new NotFoundException('Goal is not an action goal');
    }

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.actionGoalId !== goal.actionData?.id) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.task.delete({ where: { id: taskId } });

    return { message: 'Task deleted successfully' };
  }

  // Candidate management methods
  async denyCandidate(goalId: string, userId: string, candidateUrl: string) {
    const goal = await this.findOne(goalId, userId);

    if (goal.type !== GoalType.item) {
      throw new BadRequestException('Not an item goal');
    }

    if (!goal.itemData) {
      throw new BadRequestException('Item data not found');
    }

    const candidates = (goal.itemData.candidates as any[]) || [];
    const deniedCandidates = (goal.itemData.deniedCandidates as any[]) || [];

    // Find the candidate being denied
    const candidateToMove = candidates.find((c) => c.url === candidateUrl);

    if (!candidateToMove) {
      throw new NotFoundException('Candidate not found');
    }

    // Add timestamp when denied
    const deniedCandidate = {
      ...candidateToMove,
      deniedAt: new Date().toISOString(),
    };

    // Move from candidates to deniedCandidates
    const updatedCandidates = candidates.filter((c) => c.url !== candidateUrl);
    const updatedDenied = [...deniedCandidates, deniedCandidate];

    await this.prisma.itemGoalData.update({
      where: { goalId },
      data: {
        candidates: updatedCandidates as any,
        deniedCandidates: updatedDenied as any,
      },
    });

    return this.findOne(goalId, userId);
  }

  async restoreCandidate(goalId: string, userId: string, candidateUrl: string) {
    const goal = await this.findOne(goalId, userId);

    if (goal.type !== GoalType.item) {
      throw new BadRequestException('Not an item goal');
    }

    if (!goal.itemData) {
      throw new BadRequestException('Item data not found');
    }

    const candidates = (goal.itemData.candidates as any[]) || [];
    const deniedCandidates = (goal.itemData.deniedCandidates as any[]) || [];

    // Find the denied candidate
    const candidateToRestore = deniedCandidates.find(
      (c) => c.url === candidateUrl,
    );

    if (!candidateToRestore) {
      throw new NotFoundException('Denied candidate not found');
    }

    // Remove deniedAt timestamp
    const { deniedAt, ...restoredCandidate } = candidateToRestore;

    // Move from deniedCandidates back to candidates
    const updatedCandidates = [...candidates, restoredCandidate];
    const updatedDenied = deniedCandidates.filter(
      (c) => c.url !== candidateUrl,
    );

    await this.prisma.itemGoalData.update({
      where: { goalId },
      data: {
        candidates: updatedCandidates as any,
        deniedCandidates: updatedDenied as any,
      },
    });

    return this.findOne(goalId, userId);
  }

  async getDeniedCandidates(goalId: string, userId: string) {
    const goal = await this.findOne(goalId, userId);

    if (goal.type !== GoalType.item) {
      throw new BadRequestException('Not an item goal');
    }

    return goal.itemData?.deniedCandidates || [];
  }

  async getScrapeJobs(goalId: string, userId: string) {
    // Verify goal belongs to user
    await this.findOne(goalId, userId);

    return this.prisma.scrapeJob.findMany({
      where: { goalId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}
