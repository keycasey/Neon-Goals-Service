import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtOrApiKeyGuard } from '../../common/guards/jwt-or-api-key.guard';
import { CreateWishlistItemDto, UpdateWishlistItemDto } from './dto';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
@UseGuards(JwtOrApiKeyGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.wishlistService.findAll(userId);
  }

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() data: CreateWishlistItemDto,
  ) {
    return this.wishlistService.create(userId, data);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() data: UpdateWishlistItemDto,
  ) {
    return this.wishlistService.update(userId, id, data);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.wishlistService.remove(userId, id);
  }
}
