import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
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
      data: {
        userId,
        title: data.title.trim(),
        notes: data.notes?.trim() || null,
        targetBudget: data.targetBudget,
        currency: data.currency || 'USD',
        priority: data.priority || 'interested',
        stage: data.stage || 'idea',
        earliestPurchaseDate: data.earliestPurchaseDate
          ? new Date(data.earliestPurchaseDate)
          : null,
      },
    });
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
}
