export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: 'sandbox' | 'development' | 'production';
  redirectUri: string;
}

export interface LinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

export interface ExchangeTokenResponse {
  access_token: string;
  item_id: string;
  request_id: string;
}

export interface BalanceResponse {
  accounts: any[];
  request_id: string;
}

export interface TransactionsResponse {
  accounts: any[];
  transactions: any[];
  total_transactions: number;
  request_id: string;
}
