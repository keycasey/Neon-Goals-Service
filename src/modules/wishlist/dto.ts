import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const wishlistPriorities = ['someday', 'interested', 'soon'] as const;
const wishlistStages = ['idea', 'researching', 'saving', 'ready', 'purchased', 'dropped'] as const;

export class CreateWishlistItemDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetBudget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsIn(wishlistPriorities)
  priority?: (typeof wishlistPriorities)[number];

  @IsOptional()
  @IsIn(wishlistStages)
  stage?: (typeof wishlistStages)[number];

  @IsOptional()
  @IsDateString()
  earliestPurchaseDate?: string;
}

export class UpdateWishlistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetBudget?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsIn(wishlistPriorities)
  priority?: (typeof wishlistPriorities)[number];

  @IsOptional()
  @IsIn(wishlistStages)
  stage?: (typeof wishlistStages)[number];

  @IsOptional()
  @IsDateString()
  earliestPurchaseDate?: string | null;
}
