import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FinicityService } from './finicity.service';
import { FinicityConnectUrlRequest } from './finicity.types';

@Controller('finicity')
@UseGuards(JwtAuthGuard)
export class FinicityController {
  constructor(private readonly finicityService: FinicityService) {}

  @Get('probe/status')
  getProbeStatus() {
    return {
      enabled: this.finicityService.isEnabled(),
    };
  }

  @Post('probe/connect-url')
  createTestConnectUrl(@Body() body: FinicityConnectUrlRequest) {
    return this.finicityService.createTestConnectUrl(body);
  }
}
