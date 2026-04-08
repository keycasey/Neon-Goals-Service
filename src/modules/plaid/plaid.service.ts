import { Injectable, Logger, BadRequestException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import {
  LinkTokenResponse,
  ExchangeTokenResponse,
  BalanceResponse,
  TransactionsResponse,
} from './plaid.interface';
import { DemoPlaidService } from './demo-plaid.service';

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private plaidClient: PlaidApi;
  private demoPlaidClient: PlaidApi;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => DemoPlaidService))
    private demoPlaidService: DemoPlaidService,
  ) {
    this.plaidClient = this.buildPlaidClient('PLAID');
    this.demoPlaidClient = this.buildPlaidClient('DEMO_PLAID', 'PLAID');
    this.logger.log('Plaid clients initialized');
  }

  private buildPlaidClient(prefix: string, fallbackPrefix?: string): PlaidApi {
    const clientId =
      this.configService.get<string>(`${prefix}_CLIENT_ID`) ||
      (fallbackPrefix ? this.configService.get<string>(`${fallbackPrefix}_CLIENT_ID`) : undefined);
    const secret =
      this.configService.get<string>(`${prefix}_SECRET`) ||
      (fallbackPrefix ? this.configService.get<string>(`${fallbackPrefix}_SECRET`) : undefined);
    const env =
      this.configService.get<string>(`${prefix}_ENV`) ||
      (fallbackPrefix ? this.configService.get<string>(`${fallbackPrefix}_ENV`) : undefined) ||
      'sandbox';

    if (!clientId || !secret) {
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_SECRET must be set`);
    }

    return new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[env],
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': clientId,
            'PLAID-SECRET': secret,
          },
        },
      }),
    );
  }

  private async getPlaidClientForUser(userId: string): Promise<PlaidApi> {
    return (await this.demoPlaidService.isDemoUser(userId)) ? this.demoPlaidClient : this.plaidClient;
  }

  private getPlaidClientForAccount(account: { isDemo?: boolean | null }): PlaidApi {
    return account.isDemo ? this.demoPlaidClient : this.plaidClient;
  }

  private shouldRetryWithoutMinUpdatedDatetime(error: any): boolean {
    const message = `${error?.response?.data?.error_message || error?.message || ''}`.toLowerCase();
    return message.includes('requested datetime out of range');
  }

  private isAdditionalInvestmentConsentRequired(error: any): boolean {
    return error?.response?.data?.error_code === 'ADDITIONAL_CONSENT_REQUIRED';
  }

  private buildInvestmentReconnectRequiredException(): ConflictException {
    return new ConflictException({
      message: 'Reconnect this investment account to grant investments access.',
      code: 'PLAID_INVESTMENTS_CONSENT_REQUIRED',
      reconnectRequired: true,
      product: 'investments',
    });
  }

  /**
   * Create a link token for Plaid Link frontend
   */
  async createLinkToken(userId: string): Promise<LinkTokenResponse> {
    this.logger.log(`Creating link token for user: ${userId} (type: ${typeof userId}, length: ${userId?.length})`);

    if (!userId) {
      throw new BadRequestException('User ID is required for link token creation');
    }

    const client = await this.getPlaidClientForUser(userId);

    const request = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Neon Goals',
      products: ['transactions'] as any[],
      optional_products: ['investments'] as any[],
      country_codes: ['US'] as any,
      language: 'en',
      redirect_uri: this.configService.get<string>('PLAID_REDIRECT_URI'),
    };

    this.logger.log(`Link token request: ${JSON.stringify({ ...request, user: { client_user_id: userId.substring(0, 8) + '...' } })}`);

    try {
      const response = await client.linkTokenCreate(request);
      this.logger.log(`Link token created for user: ${userId}`);
      return response.data;
    } catch (error: any) {
      // Log detailed Plaid error
      const plaidError = error?.response?.data;
      this.logger.error('Plaid link token creation failed:', {
        status: error?.response?.status,
        errorCode: plaidError?.error_code,
        errorMessage: plaidError?.error_message,
        requestType: plaidError?.request_type,
        fullError: plaidError || error?.message || error,
      });
      throw new BadRequestException(
        plaidError?.error_message || 'Failed to create link token',
      );
    }
  }

  async createReconnectLinkToken(
    userId: string,
    plaidAccountId: string,
    product: 'investments' = 'investments',
  ): Promise<LinkTokenResponse> {
    const account = await this.prisma.plaidAccount.findFirst({
      where: {
        id: plaidAccountId,
        userId,
      },
      select: {
        accessToken: true,
        isDemo: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    const client = this.getPlaidClientForAccount(account);
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'Neon Goals',
      country_codes: ['US'] as any,
      language: 'en',
      redirect_uri: this.configService.get<string>('PLAID_REDIRECT_URI'),
      access_token: account.accessToken,
      additional_consented_products: [product] as any[],
    });

    return response.data;
  }

  /**
   * Exchange public token and save linked accounts to database
   * Returns the saved PlaidAccount records (without access tokens)
   */
  async linkPlaidAccount(userId: string, publicToken: string): Promise<{
    accounts: Array<{
      id: string;
      plaidAccountId: string;
      accountName: string;
      institutionName: string;
      accountMask: string;
      mask: string;
      accountType: string;
      accountSubtype: string;
      currentBalance: number;
    }>;
    itemId: string;
  }> {
    this.logger.log(`Linking Plaid account for user: ${userId}, token: ${publicToken?.substring(0, 20)}...`);

    if (!publicToken) {
      throw new BadRequestException('Public token is required');
    }

    const isDemoUser = await this.demoPlaidService.isDemoUser(userId);
    const client = isDemoUser ? this.demoPlaidClient : this.plaidClient;

    try {
      // Exchange public token for access token
      this.logger.log('Exchanging public token for access token...');
      const exchangeResponse = await client.itemPublicTokenExchange({
        public_token: publicToken,
      });

      const { access_token, item_id } = exchangeResponse.data;
      this.logger.log(`Token exchanged successfully, item_id: ${item_id}`);

      // Get item info (institution details)
      this.logger.log('Fetching item info...');
      const itemResponse = await client.itemGet({
        access_token: access_token,
      });

      const institution = itemResponse.data.item.institution_id
        ? await this.getInstitutionName(itemResponse.data.item.institution_id, client)
        : { name: 'Unknown Bank', logo: '' };

      this.logger.log(`Institution: ${institution.name}`);

      // Get accounts with balances
      this.logger.log('Fetching accounts with balances...');
      // Use 24 hours ago - Plaid balances typically update daily
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let accountsResponse;
      try {
        accountsResponse = await client.accountsBalanceGet({
          access_token: access_token,
          options: {
            min_last_updated_datetime: oneDayAgo.toISOString(),
          },
        });
      } catch (error: any) {
        if (!this.shouldRetryWithoutMinUpdatedDatetime(error)) {
          throw error;
        }

        this.logger.warn('Retrying account balance fetch without min_last_updated_datetime');
        accountsResponse = await client.accountsBalanceGet({
          access_token: access_token,
        });
      }

      this.logger.log(`Found ${accountsResponse.data.accounts.length} accounts`);

      const savedAccounts = [];

      for (const account of accountsResponse.data.accounts) {
        this.logger.log(`Saving ${account.type} account: ${account.name} (${account.mask})`);

        try {
          // Upsert to prevent duplicates - use plaidAccountId as unique identifier
          const plaidAccount = await this.prisma.plaidAccount.upsert({
            where: {
              plaidAccountId: account.account_id,
            },
            update: {
              accessToken: access_token,
              itemId: item_id,
              institutionName: institution.name,
              institutionId: itemResponse.data.item.institution_id || 'unknown',
              accountName: account.name,
              accountMask: account.mask,
              accountType: account.type,
              accountSubtype: account.subtype?.[0] || 'unknown',
              currentBalance: account.balances.current || 0,
              availableBalance: account.balances.available || null,
              currency: account.balances.iso_currency_code || 'USD',
              isDemo: isDemoUser,
              isActive: true, // Reactivate if previously soft-deleted
            },
            create: {
              userId,
              accessToken: access_token,
              itemId: item_id,
              plaidAccountId: account.account_id,
              institutionName: institution.name,
              institutionId: itemResponse.data.item.institution_id || 'unknown',
              accountName: account.name,
              accountMask: account.mask,
              accountType: account.type,
              accountSubtype: account.subtype?.[0] || 'unknown',
              currentBalance: account.balances.current || 0,
              availableBalance: account.balances.available || null,
              currency: account.balances.iso_currency_code || 'USD',
              isDemo: isDemoUser,
            },
            select: {
              id: true,
              plaidAccountId: true,
              accountName: true,
              institutionName: true,
              accountMask: true,
              accountType: true,
              accountSubtype: true,
              currentBalance: true,
            },
          });

          savedAccounts.push({
            id: plaidAccount.id,
            plaidAccountId: plaidAccount.plaidAccountId,
            accountName: plaidAccount.accountName,
            institutionName: plaidAccount.institutionName,
            accountMask: plaidAccount.accountMask,
            mask: plaidAccount.accountMask,
            accountType: plaidAccount.accountType,
            accountSubtype: plaidAccount.accountSubtype,
            currentBalance: plaidAccount.currentBalance,
          });

          this.logger.log(`Saved account: ${plaidAccount.accountName} (${plaidAccount.accountMask})`);
        } catch (dbError: any) {
          this.logger.error(`Failed to save account ${account.name}: ${dbError.message}`);
          throw new BadRequestException(`Failed to save account: ${dbError.message}`);
        }
      }

      this.logger.log(`Successfully linked ${savedAccounts.length} accounts`);

      // Fetch initial transactions for each account (async, don't block response)
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      for (const savedAccount of savedAccounts) {
        const syncPromise = savedAccount.accountType === 'investment'
          ? this.fetchAndStoreInvestmentData(savedAccount.id, startDate, endDate).then((result) =>
              this.logger.log(
                `Fetched ${result.holdings} holdings and ${result.transactions} investment transactions for ${savedAccount.accountName}`,
              ),
            )
          : this.fetchAndStoreTransactions(savedAccount.id, startDate, endDate).then((result) =>
              this.logger.log(`Fetched ${result.stored} transactions for ${savedAccount.accountName}`),
            );

        syncPromise.catch((err) =>
          this.logger.error(`Failed to fetch sync data for ${savedAccount.accountName}:`, err),
        );
      }

      return {
        accounts: savedAccounts,
        itemId: item_id,
      };
    } catch (error: any) {
      // Log detailed Plaid error
      const plaidError = error?.response?.data;
      this.logger.error('Plaid link account failed:', {
        status: error?.response?.status,
        errorCode: plaidError?.error_code,
        errorMessage: plaidError?.error_message,
        errorType: plaidError?.error_type,
        requestType: plaidError?.request_type,
        fullError: error?.message || error,
      });

      if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED') {
        throw new BadRequestException('Plaid account requires re-authentication. Please link again.');
      }

      throw new BadRequestException(
        plaidError?.error_message || error?.message || 'Failed to link Plaid account',
      );
    }
  }

  /**
   * Get institution name from ID
   */
  private async getInstitutionName(
    institutionId: string,
    client: PlaidApi = this.plaidClient,
  ): Promise<{ name: string; logo: string }> {
    try {
      const response = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US'] as any,
      });

      return {
        name: response.data.institution.name,
        logo: response.data.institution.logo || '',
      };
    } catch (error) {
      this.logger.warn(`Could not get institution details for ${institutionId}`);
      return { name: 'Unknown Bank', logo: '' };
    }
  }

  /**
   * Get user's linked Plaid accounts
   */
  async getUserLinkedAccounts(userId: string) {
    const accounts = await this.prisma.plaidAccount.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      // Don't return access tokens
      select: {
        id: true,
        plaidAccountId: true,
        institutionName: true,
        accountName: true,
        accountMask: true,
        accountType: true,
        accountSubtype: true,
        currentBalance: true,
        availableBalance: true,
        currency: true,
        lastSync: true,
        createdAt: true,
      },
    });

    // Map accountMask to mask for frontend compatibility
    return accounts.map(account => ({
      ...account,
      mask: account.accountMask,
    }));
  }

  /**
   * Delete/unlink a Plaid account
   */
  async deleteAccount(userId: string, accountId: string) {
    // Verify account belongs to user
    const account = await this.prisma.plaidAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    // Hard delete - remove account and associated transactions
    await this.prisma.plaidTransaction.deleteMany({
      where: { plaidAccountId: accountId },
    });

    await this.prisma.plaidAccount.delete({
      where: { id: accountId },
    });

    this.logger.log(`Deleted account ${accountId} for user ${userId}`);

    return { success: true };
  }

  /**
   * Sync balances for a linked Plaid account
   */
  async syncAccountBalance(plaidAccountId: string) {
    const account = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        lastSync: true,
        financeGoalId: true,
        isDemo: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    // Use lastSync if recent, otherwise cap at 24h to avoid "datetime out of range" errors
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const minUpdateTime = account.lastSync > oneDayAgo ? account.lastSync : oneDayAgo;

    const response = await this.getPlaidClientForAccount(account).accountsBalanceGet({
      access_token: account.accessToken,
      options: {
        min_last_updated_datetime: minUpdateTime.toISOString(),
      },
    });

    const plaidAccount = response.data.accounts.find(
      (a) => a.account_id === account.plaidAccountId,
    );

    if (!plaidAccount) {
      throw new BadRequestException('Account not found in Plaid');
    }

    // Update balance in database
    const updated = await this.prisma.plaidAccount.update({
      where: { id: plaidAccountId },
      data: {
        currentBalance: plaidAccount.balances.current || 0,
        availableBalance: plaidAccount.balances.available || null,
        lastSync: new Date(),
      },
      select: {
        currentBalance: true,
        lastSync: true,
      },
    });

    // If this account is linked to a finance goal, update that too
    if (account.financeGoalId) {
      await this.prisma.financeGoalData.update({
        where: { id: account.financeGoalId },
        data: {
          currentBalance: updated.currentBalance,
          lastSync: updated.lastSync,
        },
      });
    }

    this.logger.log(`Synced balance for account ${plaidAccountId}: ${updated.currentBalance}`);

    return updated;
  }

  /**
   * Link a Plaid account to a finance goal
   */
  async linkToFinanceGoal(plaidAccountId: string, financeGoalId: string) {
    const plaidAccount = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
    });

    if (!plaidAccount) {
      throw new BadRequestException('Plaid account not found');
    }

    const financeGoal = await this.prisma.financeGoalData.findUnique({
      where: { id: financeGoalId },
      include: { goal: true },
    });

    if (!financeGoal) {
      throw new BadRequestException('Finance goal not found');
    }

    // Update the Plaid account with the finance goal ID
    const updated = await this.prisma.plaidAccount.update({
      where: { id: plaidAccountId },
      data: {
        financeGoalId,
      },
    });

    // Update the finance goal with current balance
    await this.prisma.financeGoalData.update({
      where: { id: financeGoalId },
      data: {
        currentBalance: plaidAccount.currentBalance,
        accountName: plaidAccount.accountName,
        institutionIcon: plaidAccount.institutionName,
        lastSync: new Date(),
      },
    });

    this.logger.log(`Linked Plaid account ${plaidAccountId} to finance goal ${financeGoalId}`);

    return updated;
  }

  /**
   * Exchange public token for access token (deprecated - use linkPlaidAccount instead)
   * @deprecated Use linkPlaidAccount instead
   */
  async exchangePublicToken(publicToken: string): Promise<ExchangeTokenResponse> {
    this.logger.log('Exchanging public token for access token');

    const request = {
      public_token: publicToken,
    };

    try {
      const response = await this.plaidClient.itemPublicTokenExchange(request);
      this.logger.log(`Public token exchanged, item_id: ${response.data.item_id}`);
      return response.data;
    } catch (error) {
      this.logger.error('Error exchanging public token:', error);
      throw new BadRequestException('Failed to exchange public token');
    }
  }

  /**
   * Get account balances
   */
  async getBalances(accessToken: string): Promise<BalanceResponse> {
    this.logger.log('Fetching account balances');

    const request = {
      access_token: accessToken,
    };

    try {
      const response = await this.plaidClient.accountsBalanceGet(request);
      this.logger.log(`Balances fetched for ${response.data.accounts.length} accounts`);
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching balances:', error);
      throw new BadRequestException('Failed to fetch balances');
    }
  }

  /**
   * Get transactions
   */
  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    count = 100,
    offset = 0,
  ): Promise<TransactionsResponse> {
    this.logger.log(`Fetching transactions from ${startDate} to ${endDate}`);

    const request = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count,
        offset,
      },
    };

    try {
      const response = await this.plaidClient.transactionsGet(request);
      this.logger.log(
        `Fetched ${response.data.transactions.length} transactions (total: ${response.data.total_transactions})`,
      );
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching transactions:', error);
      throw new BadRequestException('Failed to fetch transactions');
    }
  }

  /**
   * Get account balance by plaidAccountId (fresh data from Plaid)
   */
  async getAccountBalance(userId: string, plaidAccountId: string) {
    if (await this.demoPlaidService.isDemoUser(userId)) {
      const account = await this.prisma.plaidAccount.findFirst({
        where: {
          id: plaidAccountId,
          userId,
          isDemo: true,
        },
        select: {
          id: true,
          accountName: true,
          institutionName: true,
          currentBalance: true,
          availableBalance: true,
          currency: true,
          lastSync: true,
        },
      });

      if (!account) {
        throw new BadRequestException('Plaid account not found');
      }

      return {
        accountId: account.id,
        accountName: account.accountName,
        institutionName: account.institutionName,
        currentBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        currency: account.currency || 'USD',
        lastSync: account.lastSync || new Date(),
      };
    }

    const account = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        lastSync: true,
        accountName: true,
        institutionName: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    // Use lastSync if recent, otherwise cap at 24h to avoid "datetime out of range" errors
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const minUpdateTime = account.lastSync > oneDayAgo ? account.lastSync : oneDayAgo;

    const response = await this.plaidClient.accountsBalanceGet({
      access_token: account.accessToken,
      options: {
        min_last_updated_datetime: minUpdateTime.toISOString(),
      },
    });

    const plaidAccount = response.data.accounts.find(
      (a) => a.account_id === account.plaidAccountId,
    );

    if (!plaidAccount) {
      throw new BadRequestException('Account not found in Plaid');
    }

    return {
      accountId: account.id,
      accountName: account.accountName,
      institutionName: account.institutionName,
      currentBalance: plaidAccount.balances.current || 0,
      availableBalance: plaidAccount.balances.available || null,
      currency: plaidAccount.balances.iso_currency_code || 'USD',
      lastSync: new Date(),
    };
  }

  /**
   * Get account transactions by plaidAccountId (fresh data from Plaid)
   */
  async getAccountTransactions(
    userId: string,
    plaidAccountId: string,
    startDate?: string,
    endDate?: string,
  ) {
    if (await this.demoPlaidService.isDemoUser(userId)) {
      const account = await this.prisma.plaidAccount.findFirst({
        where: {
          id: plaidAccountId,
          userId,
          isDemo: true,
        },
        select: {
          id: true,
          accountName: true,
          institutionName: true,
        },
      });

      if (!account) {
        throw new BadRequestException('Plaid account not found');
      }

      const transactions = await this.demoPlaidService.getDemoTransactions(plaidAccountId, userId);

      const end = endDate || new Date().toISOString().split('T')[0];
      const start =
        startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      return {
        accountId: account.id,
        accountName: account.accountName,
        institutionName: account.institutionName,
        transactions,
        totalTransactions: transactions.length,
        startDate: start,
        endDate: end,
      };
    }

    const account = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        accountName: true,
        institutionName: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    // Default to last 30 days
    const end = endDate || new Date().toISOString().split('T')[0];
    const start =
      startDate ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await this.plaidClient.transactionsGet({
      access_token: account.accessToken,
      start_date: start,
      end_date: end,
    });

    // Filter transactions for this specific account
    const accountTransactions = response.data.transactions.filter(
      (t) => t.account_id === account.plaidAccountId,
    );

    return {
      accountId: account.id,
      accountName: account.accountName,
      institutionName: account.institutionName,
      transactions: accountTransactions,
      totalTransactions: accountTransactions.length,
      startDate: start,
      endDate: end,
    };
  }

  async getStoredInvestments(userId: string, plaidAccountId: string, limit = 100) {
    const account = await this.prisma.plaidAccount.findFirst({
      where: { id: plaidAccountId, userId },
      select: {
        accountName: true,
        institutionName: true,
        accountType: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    const [holdings, transactions] = await Promise.all([
      this.prisma.plaidInvestmentHolding.findMany({
        where: { plaidAccountId },
        orderBy: [{ institutionValue: 'desc' }, { updatedAt: 'desc' }],
        include: {
          security: true,
        },
      }),
      this.prisma.plaidInvestmentTransaction.findMany({
        where: { plaidAccountId },
        orderBy: { date: 'desc' },
        take: limit,
        include: {
          security: true,
        },
      }),
    ]);

    return {
      accountName: account.accountName,
      institutionName: account.institutionName,
      accountType: account.accountType,
      holdings: holdings.map((holding) => ({
        id: holding.id,
        securityId: holding.security.securityId,
        name: holding.security.name,
        tickerSymbol: holding.security.tickerSymbol,
        quantity: holding.quantity,
        institutionPrice: holding.institutionPrice,
        institutionPriceAsOf: holding.institutionPriceAsOf,
        institutionValue: holding.institutionValue,
        costBasis: holding.costBasis,
        currency: holding.currency,
        currentPrice: holding.institutionPrice ?? holding.security.closePrice,
        currentPriceAsOf: holding.institutionPriceAsOf ?? holding.security.closePriceAsOf,
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        investmentTransactionId: transaction.investmentTransactionId,
        securityId: transaction.security?.securityId ?? null,
        securityName: transaction.security?.name ?? null,
        tickerSymbol: transaction.security?.tickerSymbol ?? null,
        amount: transaction.amount,
        quantity: transaction.quantity,
        fees: transaction.fees,
        price: transaction.price,
        date: transaction.date,
        name: transaction.name,
        type: transaction.type,
        subtype: transaction.subtype,
        currency: transaction.currency,
        currentPrice: transaction.security?.closePrice ?? null,
        currentPriceAsOf: transaction.security?.closePriceAsOf ?? null,
      })),
    };
  }

  async fetchAndStoreInvestmentData(
    plaidAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ holdings: number; transactions: number }> {
    const account = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        accountName: true,
        accountType: true,
        isDemo: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    const client = this.getPlaidClientForAccount(account);

    let holdingsResponse;
    let transactionsResponse;
    try {
      [holdingsResponse, transactionsResponse] = await Promise.all([
        client.investmentsHoldingsGet({
          access_token: account.accessToken,
        }),
        client.investmentsTransactionsGet({
          access_token: account.accessToken,
          start_date: startDate,
          end_date: endDate,
        }),
      ]);
    } catch (error: any) {
      if (this.isAdditionalInvestmentConsentRequired(error)) {
        throw this.buildInvestmentReconnectRequiredException();
      }
      throw error;
    }

    const filteredHoldings = holdingsResponse.data.holdings.filter(
      (holding) => holding.account_id === account.plaidAccountId,
    );
    const filteredTransactions = transactionsResponse.data.investment_transactions.filter(
      (transaction) => transaction.account_id === account.plaidAccountId,
    );

    const securityById = new Map<string, any>();
    for (const security of [
      ...holdingsResponse.data.securities,
      ...transactionsResponse.data.securities,
    ]) {
      securityById.set(security.security_id, security);
    }

    for (const security of securityById.values()) {
      await this.prisma.plaidSecurity.upsert({
        where: { securityId: security.security_id },
        update: {
          name: security.name,
          tickerSymbol: security.ticker_symbol ?? null,
          type: security.type ?? null,
          closePrice: security.close_price ?? null,
          closePriceAsOf: security.close_price_as_of
            ? new Date(security.close_price_as_of)
            : null,
          currency:
            security.iso_currency_code ??
            security.unofficial_currency_code ??
            'USD',
        },
        create: {
          securityId: security.security_id,
          name: security.name,
          tickerSymbol: security.ticker_symbol ?? null,
          type: security.type ?? null,
          closePrice: security.close_price ?? null,
          closePriceAsOf: security.close_price_as_of
            ? new Date(security.close_price_as_of)
            : null,
          currency:
            security.iso_currency_code ??
            security.unofficial_currency_code ??
            'USD',
        },
      });
    }

    await this.prisma.plaidInvestmentHolding.deleteMany({
      where: { plaidAccountId: account.id },
    });

    for (const holding of filteredHoldings) {
      await this.prisma.plaidInvestmentHolding.create({
        data: {
          plaidAccountId: account.id,
          plaidSecurityId: (
            await this.prisma.plaidSecurity.findUnique({
              where: { securityId: holding.security_id },
              select: { id: true },
            })
          )!.id,
          quantity: holding.quantity,
          institutionPrice: holding.institution_price ?? null,
          institutionPriceAsOf: holding.institution_price_as_of
            ? new Date(holding.institution_price_as_of)
            : null,
          institutionValue: holding.institution_value ?? null,
          costBasis: holding.cost_basis ?? null,
          currency:
            holding.iso_currency_code ??
            holding.unofficial_currency_code ??
            'USD',
          lastSync: new Date(),
        },
      });
    }

    for (const transaction of filteredTransactions) {
      const security = transaction.security_id
        ? await this.prisma.plaidSecurity.findUnique({
            where: { securityId: transaction.security_id },
            select: { id: true },
          })
        : null;

      await this.prisma.plaidInvestmentTransaction.upsert({
        where: {
          plaidAccountId_investmentTransactionId: {
            plaidAccountId: account.id,
            investmentTransactionId: transaction.investment_transaction_id,
          },
        },
        update: {
          plaidSecurityId: security?.id ?? null,
          amount: transaction.amount,
          quantity: transaction.quantity ?? null,
          fees: transaction.fees ?? null,
          price: transaction.price ?? null,
          date: new Date(transaction.date),
          name: transaction.name,
          type: transaction.type ?? null,
          subtype: transaction.subtype ?? null,
          currency:
            transaction.iso_currency_code ??
            transaction.unofficial_currency_code ??
            'USD',
          lastSync: new Date(),
        },
        create: {
          plaidAccountId: account.id,
          investmentTransactionId: transaction.investment_transaction_id,
          plaidSecurityId: security?.id ?? null,
          amount: transaction.amount,
          quantity: transaction.quantity ?? null,
          fees: transaction.fees ?? null,
          price: transaction.price ?? null,
          date: new Date(transaction.date),
          name: transaction.name,
          type: transaction.type ?? null,
          subtype: transaction.subtype ?? null,
          currency:
            transaction.iso_currency_code ??
            transaction.unofficial_currency_code ??
            'USD',
          lastSync: new Date(),
        },
      });
    }

    await this.prisma.plaidAccount.update({
      where: { id: plaidAccountId },
      data: { lastSync: new Date() },
      select: { id: true },
    });

    return {
      holdings: filteredHoldings.length,
      transactions: filteredTransactions.length,
    };
  }

  /**
   * Fetch transactions from Plaid and store in database
   * Returns count of stored and skipped transactions
   */
  async fetchAndStoreTransactions(
    plaidAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ stored: number; skipped: number }> {
    const account = await this.prisma.plaidAccount.findUnique({
      where: { id: plaidAccountId },
      select: {
        id: true,
        accessToken: true,
        plaidAccountId: true,
        accountName: true,
        isDemo: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Plaid account not found');
    }

    const response = await this.getPlaidClientForAccount(account).transactionsGet({
      access_token: account.accessToken,
      start_date: startDate,
      end_date: endDate,
    });

    const accountTransactions = response.data.transactions.filter(
      (t) => t.account_id === account.plaidAccountId,
    );

    this.logger.log(
      `Fetched ${accountTransactions.length} transactions for ${account.accountName}`,
    );

    let stored = 0;
    let skipped = 0;

    for (const txn of accountTransactions) {
      try {
        await this.prisma.plaidTransaction.upsert({
          where: {
            plaidAccountId_transactionId: {
              plaidAccountId: account.id,
              transactionId: txn.transaction_id,
            },
          },
          create: {
            plaidAccountId: account.id,
            transactionId: txn.transaction_id,
            amount: txn.amount,
            currency: txn.iso_currency_code || 'USD',
            date: new Date(txn.date),
            name: txn.name,
            merchantName: txn.merchant_name || null,
            // Use personal_finance_category (newer) or category (legacy)
            category: txn.personal_finance_category?.primary || txn.category?.[0] || null,
            categories: txn.personal_finance_category
              ? [txn.personal_finance_category.primary, txn.personal_finance_category.detailed].filter(Boolean)
              : (txn.category || []),
            paymentChannel: txn.payment_channel,
            pending: txn.pending,
            authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
            locationData: txn.location ? JSON.stringify(txn.location) : null,
            transactionType: txn.transaction_type,
          },
          update: {
            amount: txn.amount,
            pending: txn.pending,
            // Update pending status when transaction settles
            updatedAt: new Date(),
          },
        });
        stored++;
      } catch (error: any) {
        this.logger.warn(
          `Failed to store transaction ${txn.transaction_id}: ${error.message}`,
        );
        skipped++;
      }
    }

    // Update lastSync on account
    await this.prisma.plaidAccount.update({
      where: { id: plaidAccountId },
      data: { lastSync: new Date() },
      select: { id: true },
    });

    this.logger.log(
      `Stored ${stored} transactions, skipped ${skipped} for account ${plaidAccountId}`,
    );

    return { stored, skipped };
  }

  /**
   * Get transaction summary for AI agent context
   * Returns recent transactions across all user's accounts
   */
  async getTransactionSummaryForAI(userId: string): Promise<{
    totalTransactions: number;
    accounts: Array<{
      accountName: string;
      institutionName: string;
      transactionCount: number;
      recentTransactions: Array<{
        date: string;
        amount: number;
        merchantName: string;
        category: string;
      }>;
    }>;
  }> {
    const accounts = await this.prisma.plaidAccount.findMany({
      where: { userId, isActive: true },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          take: 50, // Last 50 transactions per account
        },
      },
    });

    return {
      totalTransactions: accounts.reduce(
        (sum, a) => sum + a.transactions.length,
        0,
      ),
      accounts: accounts
        .filter((a) => a.transactions.length > 0)
        .map((account) => ({
          accountName: account.accountName,
          institutionName: account.institutionName,
          transactionCount: account.transactions.length,
          recentTransactions: account.transactions.map((t) => ({
            date: t.date.toISOString().split('T')[0],
            amount: t.amount,
            merchantName: t.merchantName || t.name,
            category: t.category || 'uncategorized',
          })),
        })),
    };
  }

  /**
   * Get stored transactions from database (for AI agents and API access)
   */
  async getStoredTransactions(
    userId: string,
    plaidAccountId: string,
    limit = 100,
  ) {
    // Verify account belongs to user
    const account = await this.prisma.plaidAccount.findFirst({
      where: { id: plaidAccountId, userId },
      select: {
        accountName: true,
        institutionName: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const transactions = await this.prisma.plaidTransaction.findMany({
      where: { plaidAccountId },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return {
      accountId: plaidAccountId,
      accountName: account.accountName,
      institutionName: account.institutionName,
      transactions: transactions.map((t) => ({
        id: t.transactionId,
        amount: t.amount,
        currency: t.currency,
        date: t.date,
        name: t.name,
        merchantName: t.merchantName,
        category: t.category,
        categories: t.categories,
        paymentChannel: t.paymentChannel,
        pending: t.pending,
      })),
      total: transactions.length,
    };
  }
}
