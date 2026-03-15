import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AiModelsService } from '../ai/ai-models.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private aiModelsService: AiModelsService,
  ) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { settings: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { settings: true },
    });
  }

  async findByGithubId(githubId: string) {
    return this.prisma.user.findUnique({
      where: { githubId },
      include: { settings: true },
    });
  }

  async updateSettings(userId: string, settings: any) {
    if (!settings || typeof settings !== 'object') {
      throw new BadRequestException('Settings payload must be an object');
    }

    if (
      Object.prototype.hasOwnProperty.call(settings, 'chatModel') &&
      !this.aiModelsService.isSupportedModelId(settings.chatModel)
    ) {
      throw new BadRequestException(`Unsupported chat model: ${settings.chatModel}`);
    }

    return this.prisma.settings.upsert({
      where: { userId },
      update: settings,
      create: {
        userId,
        ...settings,
      },
    });
  }

  async getUserWithGoals(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        goals: {
          include: {
            itemData: true,
            financeData: true,
            actionData: {
              include: {
                tasks: true,
              },
            },
          },
        },
      },
    });
  }

  getAvailableModels() {
    return this.aiModelsService.toClientSchema();
  }
}
