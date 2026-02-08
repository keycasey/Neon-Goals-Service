export class CreateLinkTokenDto {
  userId: string;
}

export class ExchangePublicTokenDto {
  publicToken: string;
  userId: string;
}

export class GetBalanceDto {
  accessToken: string;
}

export class GetTransactionsDto {
  accessToken: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  count?: number;
  offset?: number;
}

export class AccountBalance {
  account_id: string;
  balances: {
    available: number;
    current: number;
    limit: number | null;
    iso_currency_code: string;
    unofficial_currency_code: string | null;
  };
  mask: string;
  name: string;
  official_name: string;
  subtype: string[];
  type: string;
}

export class Transaction {
  account_id: string;
  account_owner: string | null;
  amount: number;
  authorized_date: string | null;
  categories: string[];
  category: string;
  date: string;
  iso_currency_code: string;
  location: {
    address: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
    state: string | null;
    store_number: string | null;
    zip: string | null;
  };
  merchant_name: string;
  name: string;
  payment_channel: string;
  pending: boolean;
  transaction_id: string;
  transaction_type: string;
  unofficial_currency_code: string | null;
}
