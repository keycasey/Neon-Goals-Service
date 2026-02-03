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

  @Post('callback')
  async handleCallback(@Body() callbackData: CallbackData) {
    this.logger.log(`Received callback for job ${callbackData.jobId}: ${callbackData.status}`);

    if (callbackData.status === 'error') {
      this.logger.error(`Job ${callbackData.jobId} failed: ${callbackData.error}`);
      await this.scraperService.handleJobError(callbackData.jobId, callbackData.error);
      return { acknowledged: true, status: 'error' };
    }

    this.logger.log(`Job ${callbackData.jobId} succeeded with ${callbackData.data?.length || 0} results`);
    await this.scraperService.handleJobSuccess(callbackData.jobId, callbackData.data);

    return { acknowledged: true, status: 'success' };
  }
}
