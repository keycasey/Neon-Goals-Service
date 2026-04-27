import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AiModelsService } from '../ai/ai-models.service';

const VALID_AGENT_CONVERSATION_MODES = new Set(['single_agent', 'group_chat']);
const VALID_THEMES = new Set(['miami-vice', 'cyberpunk', 'synthwave']);
const ALLOWED_SETTINGS_KEYS = new Set([
  'theme',
  'chatModel',
  'displayName',
  'agentConversationMode',
]);

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
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.getPrototypeOf(settings) !== Object.prototype
    ) {
      throw new BadRequestException('Settings payload must be an object');
    }

    const data: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        throw new BadRequestException(`Unsupported settings field: ${key}`);
      }

      data[key] = value;
    }

    if (
      Object.prototype.hasOwnProperty.call(data, 'theme') &&
      (typeof data.theme !== 'string' || !VALID_THEMES.has(data.theme))
    ) {
      throw new BadRequestException(`Unsupported theme: ${data.theme}`);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'displayName')) {
      if (
        typeof data.displayName !== 'string' ||
        data.displayName.trim().length === 0 ||
        data.displayName.length > 120
      ) {
        throw new BadRequestException(
          'Display name must be a non-empty string of 120 characters or fewer',
        );
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(data, 'chatModel') &&
      (typeof data.chatModel !== 'string' ||
        !this.aiModelsService.isSupportedModelId(data.chatModel))
    ) {
      throw new BadRequestException(`Unsupported chat model: ${data.chatModel}`);
    }

    if (
      Object.prototype.hasOwnProperty.call(data, 'agentConversationMode') &&
      (typeof data.agentConversationMode !== 'string' ||
        !VALID_AGENT_CONVERSATION_MODES.has(data.agentConversationMode))
    ) {
      throw new BadRequestException(
        `Unsupported agent conversation mode: ${data.agentConversationMode}`,
      );
    }

    return this.prisma.settings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
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
