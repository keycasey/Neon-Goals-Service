import { describe, expect, it, mock } from 'bun:test';

import { AiGoalChatController } from './ai-goal-creation.controller';

describe('AiGoalChatController', () => {
  it('streams a completed SSE payload for an existing goal chat', async () => {
    const continueGoalConversation = mock(async () => ({
      content: 'Goal chat reply',
      commands: [{ type: 'UPDATE_TITLE' }],
      awaitingConfirmation: true,
      proposalType: 'confirm_edit_cancel',
    }));

    const controller = new AiGoalChatController(
      {
        continueGoalConversation,
      } as any,
      {
        goal: {
          findFirst: mock(async () => ({
            id: 'goal-1',
            type: 'group',
            title: 'Demo group',
            description: 'demo description',
            itemData: null,
            financeData: null,
            actionData: null,
            groupData: { layout: 'grid' },
          })),
        },
      } as any,
      {} as any,
      {} as any,
      {
        checkAndIncrement: mock(async () => undefined),
      } as any,
    );

    const writes: string[] = [];
    const res = {
      setHeader: mock(() => undefined),
      write: mock((chunk: string) => {
        writes.push(chunk);
      }),
      end: mock(() => undefined),
    } as any;

    await controller.chatStream('goal-1', 'user-1', { message: 'help' }, res);

    expect(continueGoalConversation).toHaveBeenCalledWith(
      'goal-1',
      'user-1',
      'help',
      expect.objectContaining({
        id: 'goal-1',
        type: 'group',
        groupData: { layout: 'grid' },
      }),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"content":"Goal chat reply"');
    expect(writes[0]).toContain('"done":true');
  });

  it('returns a completed SSE error payload when the goal cannot be loaded', async () => {
    const controller = new AiGoalChatController(
      {
        continueGoalConversation: mock(async () => ({})),
      } as any,
      {
        goal: {
          findFirst: mock(async () => null),
        },
      } as any,
      {} as any,
      {} as any,
      {
        checkAndIncrement: mock(async () => undefined),
      } as any,
    );

    const writes: string[] = [];
    const res = {
      setHeader: mock(() => undefined),
      write: mock((chunk: string) => {
        writes.push(chunk);
      }),
      end: mock(() => undefined),
    } as any;

    await controller.chatStream('group-1', 'user-1', { message: 'help' }, res);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('Goal not found');
    expect(writes[0]).toContain('"done":true');
  });
});
