export type AIModelProvider = 'openai';

export type AIModelConfig = {
  id: string;
  label: string;
  provider: AIModelProvider;
  apiModel: string;
  enabled: boolean;
  supportsStreaming: boolean;
  dspyStudentModel: string;
  dspyJudgeCompatible: boolean;
  description?: string;
};

export const AI_MODELS = [
  {
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'openai',
    apiModel: 'gpt-5-nano',
    enabled: true,
    supportsStreaming: true,
    dspyStudentModel: 'openai/gpt-5-nano',
    dspyJudgeCompatible: true,
    description: 'Fast default model for assistant responses.',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'openai',
    apiModel: 'gpt-4o-mini',
    enabled: true,
    supportsStreaming: true,
    dspyStudentModel: 'openai/gpt-4o-mini',
    dspyJudgeCompatible: true,
    description: 'Lower-cost general-purpose model.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    apiModel: 'gpt-4o',
    enabled: true,
    supportsStreaming: true,
    dspyStudentModel: 'openai/gpt-4o',
    dspyJudgeCompatible: true,
    description: 'Balanced quality and speed.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'openai',
    apiModel: 'gpt-4.1',
    enabled: true,
    supportsStreaming: true,
    dspyStudentModel: 'openai/gpt-4.1',
    dspyJudgeCompatible: true,
    description: 'Higher-quality model for harder conversations.',
  },
] as const satisfies readonly AIModelConfig[];

export const DEFAULT_AI_MODEL_ID = 'gpt-5-nano';

export function getAIModelById(modelId: string | null | undefined): AIModelConfig | undefined {
  if (!modelId) {
    return undefined;
  }
  return AI_MODELS.find(model => model.id === modelId);
}

export function getEnabledAIModels(): AIModelConfig[] {
  return AI_MODELS.filter(model => model.enabled);
}

export function getDefaultAIModel(): AIModelConfig {
  return getAIModelById(DEFAULT_AI_MODEL_ID) ?? AI_MODELS[0];
}

export function isSupportedAIModelId(modelId: string | null | undefined): boolean {
  return Boolean(getAIModelById(modelId));
}
