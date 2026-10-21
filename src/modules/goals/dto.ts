import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const statuses = ['active', 'completed', 'archived'] as const;
const itemCategories = [
  'vehicle',
  'vehicle_parts',
  'technology',
  'electronics',
  'sporting_goods',
  'clothing',
  'apparel',
  'pets',
  'furniture',
  'general',
] as const;

class CreateTaskInputDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class GoalFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(statuses)
  status?: 'active' | 'completed' | 'archived';
}

export class CreateItemGoalDto extends GoalFieldsDto {
  @IsString()
  declare title: string;

  @IsOptional() @IsUrl() productImage?: string;
  @IsOptional() @IsNumber() @Min(0) bestPrice?: number;
  @IsOptional() @IsNumber() @Min(0) targetAmount?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsUrl() retailerUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) retailerName?: string;
  @IsOptional() @IsIn(['in_stock', 'price_drop', 'pending_search', 'candidates_found', 'not_found', 'not_supported']) statusBadge?: string;
  @IsOptional() searchResults?: unknown;
  @IsOptional() candidates?: unknown;
  @IsOptional() deniedCandidates?: unknown;
  @IsOptional() shortlistedCandidates?: unknown;
  @IsOptional() @IsString() selectedCandidateId?: string;
  @IsOptional() @IsString() stackId?: string;
  @IsOptional() @IsInt() @Min(0) stackOrder?: number;
  @IsOptional() @IsString() searchTerm?: string;
  @IsOptional() @IsIn(itemCategories) category?: string;
  @IsOptional() searchFilters?: unknown;
  @IsOptional() retailerFilters?: unknown;
}

export class CreateFinanceGoalDto extends GoalFieldsDto {
  @IsString() declare title: string;
  @IsString() institutionIcon: string;
  @IsString() accountName: string;
  @IsNumber() currentBalance: number;
  @IsNumber() targetBalance: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) progressHistory?: number[];
}

export class CreateActionGoalDto extends GoalFieldsDto {
  @IsString() declare title: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) completionPercentage?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskInputDto)
  tasks?: CreateTaskInputDto[];
  @IsOptional() @IsString() motivation?: string;
}

export class CreateGroupGoalDto extends GoalFieldsDto {
  @IsString() declare title: string;
  @IsOptional() @IsString() parentGoalId?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(['grid', 'list', 'kanban']) layout?: string;
  @IsOptional() @IsIn(['average', 'sum', 'manual']) progressType?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) progress?: number;
}

export class UpdateGoalDto extends GoalFieldsDto {}
export class UpdateItemGoalDto extends CreateItemGoalDto {
  @IsOptional() declare title: string;
}
export class UpdateFinanceGoalDto extends CreateFinanceGoalDto {
  @IsOptional() declare title: string;
  @IsOptional() declare institutionIcon: string;
  @IsOptional() declare accountName: string;
  @IsOptional() declare currentBalance: number;
  @IsOptional() declare targetBalance: number;
  @IsOptional() @IsDateString() lastSync?: string;
}
export class UpdateActionGoalDto extends CreateActionGoalDto {
  @IsOptional() declare title: string;
}
export class UpdateGroupGoalDto extends CreateGroupGoalDto {
  @IsOptional() declare title: string;
}

export class TaskDto {
  @IsString()
  @MaxLength(500)
  title: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CandidateUrlDto {
  @IsUrl()
  candidateUrl: string;
}
