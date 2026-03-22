import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FinicityAuthResponse,
  FinicityConnectUrlRequest,
  FinicityConnectUrlResult,
  FinicityCustomerResponse,
  FinicityGenerateConnectUrlResponse,
} from './finicity.types';
import {
  buildInstitutionSettings,
  buildTestingCustomerUsername,
} from './finicity.helpers';

@Injectable()
export class FinicityService {
  private readonly logger = new Logger(FinicityService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(
      this.configService.get<string>('FINICITY_PARTNER_ID') &&
        this.configService.get<string>('FINICITY_APP_KEY') &&
        this.configService.get<string>('FINICITY_PARTNER_SECRET'),
    );
  }

  async createTestConnectUrl(
    request: FinicityConnectUrlRequest = {},
  ): Promise<FinicityConnectUrlResult> {
    if (!this.isEnabled()) {
      throw new BadRequestException('Finicity probe is not configured');
    }

    const customerId = request.customerId ?? (await this.createTestingCustomer()).id;
    const connectUrl = await this.generateConnectUrl(customerId, request.institutionId);

    return {
      customerId,
      connectUrl,
      institutionId: request.institutionId,
      usedTestingCustomer: !request.customerId,
    };
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('FINICITY_BASE_URL', 'https://api.finicity.com');
  }

  private async getAppToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.value;
    }

    const partnerId = this.configService.get<string>('FINICITY_PARTNER_ID');
    const appKey = this.configService.get<string>('FINICITY_APP_KEY');
    const partnerSecret = this.configService.get<string>('FINICITY_PARTNER_SECRET');

    const response = await fetch(`${this.getBaseUrl()}/aggregation/v2/partners/authentication`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Finicity-App-Key': appKey || '',
      },
      body: JSON.stringify({
        partnerId,
        partnerSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Finicity auth failed (${response.status}): ${body}`);
      throw new BadRequestException(`Finicity auth failed: ${body}`);
    }

    const data = (await response.json()) as FinicityAuthResponse;
    this.cachedToken = {
      value: data.token,
      expiresAt: now + 90 * 60 * 1000,
    };
    return data.token;
  }

  private async createTestingCustomer(): Promise<FinicityCustomerResponse> {
    const token = await this.getAppToken();
    const appKey = this.configService.get<string>('FINICITY_APP_KEY');
    const username = buildTestingCustomerUsername(Date.now());

    const response = await fetch(`${this.getBaseUrl()}/aggregation/v2/customers/testing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Finicity-App-Key': appKey || '',
        'Finicity-App-Token': token,
      },
      body: JSON.stringify({
        username,
        firstName: 'Neon',
        lastName: 'Probe',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Finicity create testing customer failed (${response.status}): ${body}`);
      throw new BadRequestException(`Finicity customer creation failed: ${body}`);
    }

    return (await response.json()) as FinicityCustomerResponse;
  }

  private async generateConnectUrl(
    customerId: string,
    institutionId?: number,
  ): Promise<string> {
    const token = await this.getAppToken();
    const appKey = this.configService.get<string>('FINICITY_APP_KEY');
    const partnerId = this.configService.get<string>('FINICITY_PARTNER_ID');
    const redirectUri = this.configService.get<string>(
      'FINICITY_REDIRECT_URI',
      'https://www.finicity.com/connect/',
    );

    const response = await fetch(`${this.getBaseUrl()}/connect/v2/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Finicity-App-Key': appKey || '',
        'Finicity-App-Token': token,
      },
      body: JSON.stringify({
        partnerId,
        customerId,
        language: 'en',
        redirectUri,
        webhookContentType: 'application/json',
        webhookData: {},
        webhookHeaders: {},
        singleUseUrl: true,
        institutionSettings: buildInstitutionSettings(institutionId),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Finicity generate connect URL failed (${response.status}): ${body}`);
      throw new BadRequestException(`Finicity connect URL failed: ${body}`);
    }

    const data = (await response.json()) as FinicityGenerateConnectUrlResponse;
    return data.link;
  }
}
