import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { hashMutationInput } from '../goals/application/goal-application.service';
import { CreateWishlistItemDto, UpdateWishlistItemDto } from './dto';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  create(userId: string, data: CreateWishlistItemDto) {
    return this.prisma.wishlistItem.create({
      data: this.createData(userId, data),
    });
  }

  async createFromMcp(userId: string, data: CreateWishlistItemDto, clientRequestId: string) {
    const normalizedInput = { ...data, clientRequestId };
    const inputHash = hashMutationInput(normalizedInput);
    const toolName = 'create_wishlist_item';

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replayMcpCreate(existing, inputHash);

        const mutation = await tx.mcpMutation.create({
          data: {
            userId,
            toolName,
            clientRequestId,
            inputHash,
            input: normalizedInput as unknown as Prisma.InputJsonValue,
          },
        });
        const item = await tx.wishlistItem.create({ data: this.createData(userId, data) });
        const result = { schemaVersion: '1', item };
        await tx.mcpMutation.update({
          where: { id: mutation.id },
          data: { status: 'applied', result: result as unknown as Prisma.InputJsonValue },
        });
        return { ...result, applied: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.mcpMutation.findUnique({
          where: { userId_toolName_clientRequestId: { userId, toolName, clientRequestId } },
        });
        if (existing) return this.replayMcpCreate(existing, inputHash);
      }
      throw error;
    }
  }

  async update(userId: string, id: string, data: UpdateWishlistItemDto) {
    await this.requireOwnedItem(userId, id);

    return this.prisma.wishlistItem.update({
      where: { id },
      data: {
        title: data.title?.trim(),
        notes: data.notes === undefined ? undefined : data.notes.trim() || null,
        targetBudget: data.targetBudget,
        currency: data.currency,
        priority: data.priority,
        stage: data.stage,
        earliestPurchaseDate:
          data.earliestPurchaseDate === undefined
            ? undefined
            : data.earliestPurchaseDate
              ? new Date(data.earliestPurchaseDate)
              : null,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.requireOwnedItem(userId, id);
    await this.prisma.wishlistItem.delete({ where: { id } });
    return { id };
  }

  private async requireOwnedItem(userId: string, id: string) {
    const item = await this.prisma.wishlistItem.findFirst({ where: { id, userId } });
    if (!item) {
      throw new NotFoundException(`Wishlist item with ID ${id} not found`);
    }
    return item;
  }

  private createData(userId: string, data: CreateWishlistItemDto) {
    return {
      userId,
      title: data.title.trim(),
      notes: data.notes?.trim() || null,
      targetBudget: data.targetBudget,
      currency: data.currency || 'USD',
      priority: data.priority || 'interested' as const,
      stage: data.stage || 'idea' as const,
      earliestPurchaseDate: data.earliestPurchaseDate
        ? new Date(data.earliestPurchaseDate)
        : null,
    };
  }

  private replayMcpCreate(record: { inputHash: string; status: string; result: Prisma.JsonValue }, inputHash: string) {
    if (record.inputHash !== inputHash) {
      throw new ConflictException('clientRequestId was already used with different input');
    }
    if (record.status !== 'applied' || !record.result) {
      throw new ConflictException('The original mutation is still being resolved; retry shortly');
    }
    return { ...(record.result as Record<string, unknown>), applied: false };
  }
}
