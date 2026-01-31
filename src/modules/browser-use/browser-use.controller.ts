import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { BrowserUseService } from './browser-use.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('browser-use')
@UseGuards(JwtAuthGuard)
export class BrowserUseController {
  constructor(private readonly browserUseService: BrowserUseService) {}

  /**
   * Search for products across multiple retailers
   */
  @Post('search')
  async searchProducts(
    @CurrentUser('userId') userId: string,
    @Body() body: { query: string; options?: any },
  ) {
    return await this.browserUseService.searchProducts(body.query, body.options);
  }

  /**
   * Get best price for a specific product
   */
  @Post('best-price')
  async getBestPrice(
    @CurrentUser('userId') userId: string,
    @Body() body: { productName: string },
  ) {
    return await this.browserUseService.getBestPrice(body.productName);
  }

  /**
   * Search for products and update an ItemGoal with the results
   */
  @Post('search-and-update/:goalId')
  async searchAndUpdateGoal(
    @CurrentUser('userId') userId: string,
    @Param('goalId') goalId: string,
    @Body() body: { query?: string },
  ) {
    return await this.browserUseService.searchAndUpdateGoal(goalId, userId, body.query);
  }

  /**
   * Monitor prices for an ItemGoal
   */
  @Post('monitor-price/:goalId')
  async monitorPrice(
    @CurrentUser('userId') userId: string,
    @Param('goalId') goalId: string,
  ) {
    return await this.browserUseService.monitorPrice(goalId);
  }
}
