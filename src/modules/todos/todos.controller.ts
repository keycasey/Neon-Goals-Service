import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { CreateTodoDto, ListTodosQueryDto, UpdateTodoDto } from './dto';
import { TodosService } from './todos.service';

@Controller('todos')
@UseGuards(JwtOrApiKeyGuard)
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get()
  findAll(@CurrentUser('userId') userId: string, @Query() query: ListTodosQueryDto) {
    return this.todos.findAll(userId, query.status);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() data: CreateTodoDto) {
    return this.todos.create(userId, data);
  }

  @Patch(':id')
  update(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() data: UpdateTodoDto) {
    return this.todos.update(userId, id, data);
  }

  @Delete(':id')
  archive(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.todos.archive(userId, id);
  }
}
