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

  it('persists valid agent conversation mode with exact upsert args', async () => {
    const { service, prisma } = createService();

    await service.updateSettings('user_1', { agentConversationMode: 'group_chat' });

    expect(prisma.settings.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      update: { agentConversationMode: 'group_chat' },
      create: { userId: 'user_1', agentConversationMode: 'group_chat' },
    });
  });

  it('rejects unknown conversation modes without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateSettings('user_1', { agentConversationMode: 'raw_specialists' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects hostile payload userId override without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateSettings('user_1', {
        userId: 'attacker',
        agentConversationMode: 'group_chat',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects array payloads without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects non-plain object payloads without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', new Date())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid theme strings without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', { theme: 'default' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects null or object theme values without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', { theme: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateSettings('user_1', { theme: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects empty display names without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', { displayName: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects object display names without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', { displayName: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects non-string chat models without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(service.updateSettings('user_1', { chatModel: {} })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects overlong display names without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateSettings('user_1', { displayName: 'a'.repeat(121) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects non-string agent conversation modes without writing settings', async () => {
    const { service, prisma } = createService();

    await expect(
      service.updateSettings('user_1', { agentConversationMode: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settings.upsert).not.toHaveBeenCalled();
  });
});
