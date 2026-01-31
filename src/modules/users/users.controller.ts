import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.usersService.getUserWithGoals(userId);
  }

  @Patch('me/settings')
  async updateSettings(
    @CurrentUser('userId') userId: string,
    @Body() settings: any,
  ) {
    return this.usersService.updateSettings(userId, settings);
  }
}
