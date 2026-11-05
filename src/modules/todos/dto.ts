import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const todoStatuses = ['active', 'completed', 'archived'] as const;
export type TodoStatusValue = (typeof todoStatuses)[number];

export class ListTodosQueryDto {
  @IsOptional()
  @IsIn(todoStatuses)
  status?: TodoStatusValue;
}

export class CreateTodoDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsIn(todoStatuses)
  status?: TodoStatusValue;
}
