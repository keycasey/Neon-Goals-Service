import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../config/prisma.service';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export interface ExtractionResult {
  success: boolean;
  name?: string;
  price?: number;
  imageUrl?: string;
  currency?: string;
  error?: string;
}

export interface ProgressData {
  jobId: string;
  status: string;
  message: string;
  url?: string;
}

type ExtractionResultWithMeta = ExtractionResult & {
  url?: string;
  jobId?: string;
};

@Injectable()
export class ProductExtractionService {
  private readonly logger = new Logger(ProductExtractionService.name);
  private readonly workerUrl: string;
  private readonly backendUrl: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.workerUrl = this.configService.get<string>('WORKER_URL', 'http://gilbert:5000');
    this.backendUrl = this.configService.get<string>('BACKEND_URL', 'http://localhost:3001');
  }

  /**
   * Extract product information from multiple URLs
   * Creates extraction jobs - worker polls to pick them up
   * Returns a groupId for tracking the batch
   */
  async extractFromUrls(urls: string[], userId: string): Promise<string> {
    const groupId = uuidv4();
    this.logger.log(`Creating extraction jobs for ${urls.length} URLs (groupId: ${groupId})`);

    for (const url of urls) {
      // Create extraction job - worker will poll and pick it up
      const job = await this.prisma.extractionJob.create({
        data: {
          url,
          status: 'pending',
          groupId,
          userId,
        },
      });

      this.logger.log(`Created extraction job ${job.id} for URL: ${url}`);
    }

    return groupId;
  }

  /**
   * Get the next pending job for worker polling
   * Returns job with URL and callback info, marks it as 'running'
   */
  async getNextPendingJob() {
    const job = await this.prisma.extractionJob.findFirst({
      where: {
        status: 'pending',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!job) {
      return null;
    }

    // Mark as running so no other worker picks it up
    await this.prisma.extractionJob.update({
      where: { id: job.id },
      data: { status: 'running' },
    });

    return job;
  }

  /**
   * Handle progress updates from the worker
   * Emits events for SSE streaming
   */
  async handleProgress(jobId: string, data: { status: string; message: string }): Promise<void> {
    this.logger.log(`Progress for job ${jobId}: ${data.status} - ${data.message}`);

    // Get the job to include URL in progress event
    const job = await this.prisma.extractionJob.findUnique({
      where: { id: jobId },
    });

    // Emit progress event for SSE subscribers
    this.eventEmitter.emit('extraction:progress', {
      jobId,
      ...data,
      url: job?.url,
    } as ProgressData);
  }

  /**
   * Handle completion callback from the worker
   * Updates job status and emits completion event
   */
  async handleCallback(jobId: string, result: ExtractionResult): Promise<void> {
    this.logger.log(`Callback for job ${jobId}: success=${result.success}`);

    // Get the job to find groupId
    const job = await this.prisma.extractionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      this.logger.error(`Job ${jobId} not found`);
      return;
    }

    // Update job with result
    await this.prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: result.success ? 'completed' : 'failed',
        result: result as any,
        error: result.error || null,
      },
    });

    // Emit individual job completion event
    this.eventEmitter.emit('extraction:complete', {
      jobId,
      result,
      url: job.url,
    });

    // Check if all jobs in group are complete
    const isComplete = await this.isGroupComplete(job.groupId);
    if (isComplete) {
      const results = await this.getGroupResults(job.groupId);
      this.logger.log(`Group ${job.groupId} complete with ${results.length} results`);

      // Emit group completion event with all results
      this.eventEmitter.emit('extraction:group_complete', {
        groupId: job.groupId,
        results,
        userId: job.userId,
      });

      // Persist a follow-up assistant message in Items chat.
      await this.sendGroupCompletionMessage(job.userId, job.groupId, results);
    }
  }

  /**
   * Check if all jobs in a group are complete
   */
  async isGroupComplete(groupId: string): Promise<boolean> {
    const pendingCount = await this.prisma.extractionJob.count({
      where: {
        groupId,
        status: { in: ['pending', 'running'] },
      },
    });
    return pendingCount === 0;
  }

  /**
   * Get all results for a group
   */
  async getGroupResults(groupId: string): Promise<ExtractionResult[]> {
    const jobs = await this.prisma.extractionJob.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });

    return jobs.map((job) => ({
      ...(job.result as unknown as ExtractionResult),
      url: job.url,
      jobId: job.id,
    })) as ExtractionResult[];
  }

  private formatPrice(price?: number, currency?: string): string {
    if (typeof price !== 'number' || Number.isNaN(price)) {
      return 'price unavailable';
    }
    const formatted = price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${currency || 'USD'} ${formatted}`;
  }

  private async sendGroupCompletionMessage(
    userId: string,
    groupId: string,
    rawResults: ExtractionResult[],
  ): Promise<void> {
    if (!userId || userId === 'agent') {
      return;
    }

    const results = rawResults as ExtractionResultWithMeta[];
    const successful = results.filter((result) => result.success);
    const failedCount = results.length - successful.length;
    const preview = successful.slice(0, 3);

    const previewLines = preview.map((result, idx) => {
      const name = result.name || 'Unnamed item';
      const price = this.formatPrice(result.price, result.currency);
      return `${idx + 1}. ${name} (${price})`;
    });

    const summaryLine =
      successful.length > 0
        ? `Extraction complete. I found ${successful.length} item${successful.length > 1 ? 's' : ''}${failedCount > 0 ? `, and ${failedCount} link${failedCount > 1 ? 's' : ''} failed` : ''}.`
        : `Extraction complete, but I could not read any items from those links.`;

    const previewText = previewLines.length > 0
      ? `\n\nHere is what I got:\n${previewLines.join('\n')}`
      : '';

    const content = `${summaryLine}${previewText}\n\nDo you want me to create a group item goal from these results?`;

    const existingItemsChat = await this.prisma.chatState.findFirst({
      where: {
        userId,
        type: 'category',
        categoryId: 'items',
      },
      select: { id: true },
    });

    const chatId = existingItemsChat
      ? existingItemsChat.id
      : (
          await this.prisma.chatState.create({
            data: {
              userId,
              type: 'category',
              categoryId: 'items',
              isLoading: false,
            },
            select: { id: true },
          })
        ).id;

    await this.prisma.message.create({
      data: {
        userId,
        chatId,
        role: 'assistant',
        content,
        metadata: {
          extraction: {
            groupId,
            successfulCount: successful.length,
            failedCount,
          },
          suggestion: {
            action: 'create_group_item_goal',
            groupId,
          },
        },
      },
    });
  }

  /**
   * Create goals from extraction results
   * Creates a Group Goal with Item Goal subgoals for each successful extraction
   */
  async createGoalsFromExtractions(
    groupId: string,
    groupName: string,
    userId: string,
  ): Promise<any> {
    const jobs = await this.prisma.extractionJob.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });

    const successfulJobs = jobs.filter(
      (job) => job.status === 'completed' && (job.result as any)?.success,
    );

    if (successfulJobs.length === 0) {
      throw new Error('No successful extractions to create goals from');
    }

    this.logger.log(
      `Creating group goal "${groupName}" with ${successfulJobs.length} item goals`,
    );

    // 1. Create Group Goal
    const groupGoal = await this.prisma.goal.create({
      data: {
        type: 'group',
        title: groupName,
        description: `Group goal created from product extraction (${successfulJobs.length} items)`,
        status: 'active',
        userId,
        groupData: {
          create: {
            icon: '📦',
            color: 'gradient-purple',
            layout: 'grid',
            progressType: 'average',
            progress: 0,
          },
        },
      },
      include: {
        groupData: true,
      },
    });

    // 2. Create Item Goal for each extracted product
    for (const job of successfulJobs) {
      const result = job.result as unknown as ExtractionResult;
      const { name, price, imageUrl } = result;

      // Generate a unique candidate ID for the extracted product
      const candidateId = uuidv4();

      await this.prisma.goal.create({
        data: {
          type: 'item',
          title: name,
          description: `Item from: ${job.url}`,
          status: 'active',
          userId,
          parentGoalId: groupGoal.id,
          itemData: {
            create: {
              searchTerm: name,
              productImage: imageUrl,
              bestPrice: price || 0,
              currency: 'USD',
              retailerUrl: job.url,
              retailerName: new URL(job.url).hostname,
              statusBadge: 'in_stock',
              candidates: [
                {
                  id: candidateId,
                  name,
                  price: price || 0,
                  image: imageUrl,
                  url: job.url,
                  retailer: new URL(job.url).hostname,
                },
              ],
              selectedCandidateId: candidateId,
            },
          },
        },
      });
    }

    this.logger.log(`✅ Created group goal ${groupGoal.id} with ${successfulJobs.length} items`);

    return groupGoal;
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.prisma.extractionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      url: job.url,
      status: job.status,
      result: job.result,
      error: job.error,
      groupId: job.groupId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Get all jobs for a group
   */
  async getGroupJobs(groupId: string): Promise<any[]> {
    const jobs = await this.prisma.extractionJob.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });

    return jobs.map((job) => ({
      id: job.id,
      url: job.url,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  }
}
