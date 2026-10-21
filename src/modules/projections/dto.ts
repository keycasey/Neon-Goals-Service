import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class HorizonQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120)
  horizon = 12;
}

export class ForecastDto {
  @IsOptional() @IsInt() @Min(1) @Max(120)
  horizon = 12;
}

export class ScenarioDto extends ForecastDto {
  @IsOptional() @IsNumber() monthlySavingsIncrease?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) diningReduction?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) subscriptionReduction?: number;
  @IsOptional() @IsNumber() incomeAdjustment?: number;
}

export class RecurringMergeDto {
  @IsString() targetItemId: string;
  @IsString() sourceItemId: string;
  @IsIn(['income', 'expense']) direction: 'income' | 'expense';
}
