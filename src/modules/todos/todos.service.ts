import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TodoStatus } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { hashMutationInput } from '../goals/application/goal-application.service';
import { CreateTodoDto, TodoStatusValue, UpdateTodoDto } from './dto';

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string, status?: TodoStatusValue) {
    return this.prisma.todo.findMany({
      where: { userId, status: status as TodoStatus | undefined },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  create(userId: string, data: CreateTodoDto) {
    return this.prisma.todo.create({ data: this.createData(userId, data) });
  }

  async update(userId: string, id: string, data: UpdateTodoDto) {
    await this.requireOwnedTodo(userId, id);
    return this.prisma.todo.update({ where: { id }, data: this.updateData(data) });
  }

  archive(userId: string, id: string) {
    return this.update(userId, id, { status: 'archived' });
  }

  createFromMcp(userId: string, data: CreateTodoDto, clientRequestId: string) {
    return this.runMcpMutation(userId, 'create_todo', clientRequestId, data, async (tx) => {
      const todo = await tx.todo.create({ data: this.createData(userId, data) });
      return { schemaVersion: '1', todo };
    });
  }

  updateFromMcp(userId: string, id: string, data: UpdateTodoDto, clientRequestId: string) {
    return this.runMcpMutation(userId, 'update_todo', clientRequestId, { id, ...data }, async (tx) => {
      const owned = await tx.todo.findFirst({ where: { id, userId } });
      if (!owned) throw new NotFoundException(`Todo with ID ${id} not found`);
      const todo = await tx.todo.update({ where: { id }, data: this.updateData(data) });
      return { schemaVersion: '1', todo };
    });
  }

  private async runMcpMutation(
    userId: string,
    toolName: string,
    clientRequestId: string,
    input: object,
    apply: (tx: Prisma.TransactionClient) => Promise<Record<string, unknown>>,
  ) {
    const normalizedInput = { ...input, clientRequestId };
    const inputHash = hashMutationInput(normalizedInput);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replayMutation(existing, inputHash);
        const mutation = await tx.mcpMutation.create({
          data: { userId, toolName, clientRequestId, inputHash, input: normalizedInput as Prisma.InputJsonValue },
        });
        const result = await apply(tx);
        await tx.mcpMutation.update({
          where: { id: mutation.id },
          data: { status: 'applied', result: result as Prisma.InputJsonValue },
        });
        return { ...result, applied: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replayMutation(existing, inputHash);
      }
      throw error;
    }
  }

  private replayMutation(record: { inputHash: string; status: string; result: Prisma.JsonValue }, inputHash: string) {
    if (record.inputHash !== inputHash) throw new ConflictException('clientRequestId was already used with different input');
    if (record.status !== 'applied' || !record.result) {
      throw new ConflictException('The original mutation is still being resolved; retry shortly');
    }
    return { ...(record.result as Record<string, unknown>), applied: false };
  }

  private async requireOwnedTodo(userId: string, id: string) {
    const todo = await this.prisma.todo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException(`Todo with ID ${id} not found`);
    return todo;
  }

  private createData(userId: string, data: CreateTodoDto) {
    return { userId, title: this.requireTitle(data.title), notes: data.notes?.trim() || null };
  }

  private updateData(data: UpdateTodoDto) {
    return {
      title: data.title === undefined ? undefined : this.requireTitle(data.title),
      notes: data.notes === undefined ? undefined : data.notes?.trim() || null,
      status: data.status as TodoStatus | undefined,
    };
  }

  private requireTitle(title: string) {
    const trimmed = title.trim();
    if (!trimmed) throw new BadRequestException('Todo title cannot be empty');
    return trimmed;
  }
}
