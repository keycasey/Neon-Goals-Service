import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  AIModelConfig,
  DEFAULT_AI_MODEL_ID,
  getAIModelById,
  getDefaultAIModel,
  getEnabledAIModels,
  isSupportedAIModelId,
} from '../../config/ai-models';

@Injectable()
export class AiModelsService {
  constructor(private prisma: PrismaService) {}

  listModels(): AIModelConfig[] {
    return getEnabledAIModels();
  }

  getDefaultModel(): AIModelConfig {
    return getDefaultAIModel();
  }

  getDefaultModelId(): string {
    return DEFAULT_AI_MODEL_ID;
  }

  getModelById(modelId: string | null | undefined): AIModelConfig | undefined {
    return getAIModelById(modelId);
  }

  isSupportedModelId(modelId: string | null | undefined): boolean {
    return isSupportedAIModelId(modelId);
  }

  async getModelForUser(userId: string): Promise<AIModelConfig> {
    const settings = await this.prisma.settings.findUnique({
      where: { userId },
      select: { chatModel: true },
    });

    return this.getModelById(settings?.chatModel) ?? this.getDefaultModel();
  }

  toClientSchema() {
    return {
      defaultModelId: this.getDefaultModelId(),
      models: this.listModels().map(model => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        supportsStreaming: model.supportsStreaming,
        description: model.description,
      })),
    };
  }
}
