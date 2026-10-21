import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLinkTokenDto {
  @IsString()
  userId: string;
}

export class ExchangePublicTokenDto {
  @IsString()
  publicToken: string;
  @IsString()
  userId: string;
}

export class LinkPlaidAccountDto {
  @IsString()
  publicToken: string;
}

export class ReconnectPlaidAccountDto {
  @IsOptional()
  @IsIn(['investments'])
  product?: 'investments';
}

export class LinkPlaidGoalDto {
  @IsString()
  plaidAccountId: string;

  @IsString()
  financeGoalId: string;
}

export class StoredRecordsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
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
