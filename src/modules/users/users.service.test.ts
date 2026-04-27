import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, mock } from 'bun:test';
import { UsersService } from './users.service';

const createService = () => {
  const prisma = {
    settings: {
      upsert: mock(async (args: any) => args),
    },
  };
  const aiModelsService = {
    isSupportedModelId: mock((modelId: string) => modelId === 'gpt-5-nano'),
    toClientSchema: mock(() => ({ models: [] })),
  };

  return { service: new UsersService(prisma as any, aiModelsService as any), prisma };
};

describe('UsersService settings validation', () => {
  it('accepts single agent conversation mode', async () => {
    const { service, prisma } = createService();

    await service.updateSettings('user_1', { agentConversationMode: 'single_agent' });

    expect(prisma.settings.upsert).toHaveBeenCalled();
  });

  it('accepts group chat conversation mode', async () => {
    const { service, prisma } = createService();

    await service.updateSettings('user_1', { agentConversationMode: 'group_chat' });

    expect(prisma.settings.upsert).toHaveBeenCalled();
  });

  it('rejects unknown conversation modes', async () => {
    const { service } = createService();

    await expect(
      service.updateSettings('user_1', { agentConversationMode: 'raw_specialists' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
