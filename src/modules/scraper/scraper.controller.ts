import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ScraperService } from './scraper.service';

interface CallbackData {
  jobId: number;
  scraper: string;
  status: 'success' | 'error';
  error?: string;
  data: any;
}

@Controller('scrapers')
export class ScraperController {
  private readonly logger = new Logger(ScraperController.name);

  constructor(private scraperService: ScraperService) {}

  /**
   * Poll endpoint for worker to pull pending jobs
   * Worker polls this endpoint instead of backend pushing to worker
   * This avoids Tailscale TCP-over-DERP issues
   */
  @Post('poll')
  async pollPendingJobs() {
    this.logger.log('Worker polling for pending jobs...');
    const job = await this.scraperService.getNextPendingJob();
    if (!job) {
      return { job: null };
    }
    this.logger.log(`Found pending job ${job.id} for goal ${job.goalId}`);
    return {
      job: {
        id: job.id,
        goalId: job.goalId,
        searchTerm: job.goal?.itemData?.searchTerm || job.goal?.title,
        retailerFilters: job.goal?.itemData?.retailerFilters || null,
        category: job.goal?.itemData?.category || 'general',
      }
    };
  }

  @Post('callback')
  async handleCallback(@Body() callbackData: CallbackData) {
    // Ensure jobId is a number (worker may send as string)
    const jobId = Number(callbackData.jobId);
    if (isNaN(jobId)) {
      this.logger.error(`Invalid jobId received: ${callbackData.jobId}`);
      return { acknowledged: false, status: 'error', message: 'Invalid jobId' };
    }
    this.logger.log(`Received callback for job ${jobId}: ${callbackData.status}`);

    if (callbackData.status === 'error') {
      this.logger.error(`Job ${jobId} failed: ${callbackData.error}`);
      await this.scraperService.handleJobError(jobId, callbackData.error);
      return { acknowledged: true, status: 'error' };
    }

    // DEBUG: Log detailed breakdown by retailer
    if (callbackData.data && Array.isArray(callbackData.data)) {
      const retailerCounts: Record<string, number> = {};
      callbackData.data.forEach((item: any) => {
        const retailer = item.retailer || item.source || 'Unknown';
        retailerCounts[retailer] = (retailerCounts[retailer] || 0) + 1;
      });
      this.logger.log(`Job ${jobId} results by retailer: ${JSON.stringify(retailerCounts)}`);
    }

    this.logger.log(`Job ${jobId} succeeded with ${callbackData.data?.length || 0} results`);
    await this.scraperService.handleJobSuccess(jobId, callbackData.data);

    return { acknowledged: true, status: 'success' };
  }
}
