import { describe, expect, it, mock } from 'bun:test';

mock.module('express', () => ({
  Response: class Response {},
}));

const createController = async () => {
  const { SpecialistController } = await import('./specialist.controller');
  const categoryChat = mock(async () => ({
    content: 'normal item specialist response',
    commands: [],
  }));
  const extractFromUrls = mock(async () => 'group-1');
  const addMessage = mock(async () => undefined);

  const controller = new SpecialistController(
    {
      categoryChat,
    } as any,
    {
      goal: {
        findMany: mock(async () => []),
      },
    } as any,
    {
      executeCommands: mock(async () => []),
    } as any,
    {
      getOrCreateCategoryChat: mock(async () => ({ id: 'chat-1' })),
      addMessage,
    } as any,
    {
      extractFromUrls,
    } as any,
    {
      checkAndIncrement: mock(async () => undefined),
    } as any,
  );

  return { controller, categoryChat, extractFromUrls, addMessage };
};

describe('SpecialistController URL extraction', () => {
  it('ignores URLs from overview context when the current user question has no URL', async () => {
    const { controller, categoryChat, extractFromUrls } = await createController();
    const message = [
      '[Context from Overview Agent]',
      'user: I want to buy https://www.elementvape.com/foo',
      'assistant: I found 1 product link!',
      '',
      "[User's Question]",
      "I want to buy a Honda Passport that isn't white and has less than 80000 miles.",
    ].join('\n');

    const response = await controller.chat(
      'items',
      { userId: 'user-1' },
      { message },
    );

    expect(extractFromUrls).not.toHaveBeenCalled();
    expect(categoryChat).toHaveBeenCalledWith(
      'user-1',
      'items',
      message,
      [],
      'chat-1',
      undefined,
    );
    expect(response.content).toBe('normal item specialist response');
  });

  it('extracts URLs from the current user question in an overview-routed message', async () => {
    const { controller, extractFromUrls } = await createController();
    const message = [
      '[Context from Overview Agent]',
      'user: I want to buy https://www.elementvape.com/old',
      '',
      "[User's Question]",
      'Please track this product https://example.com/current-product',
    ].join('\n');

    const response = await controller.chat(
      'items',
      { userId: 'user-1' },
      { message },
    );

    expect(extractFromUrls).toHaveBeenCalledWith(
      ['https://example.com/current-product'],
      'user-1',
    );
    expect(response.extraction).toEqual({
      groupId: 'group-1',
      urls: ['https://example.com/current-product'],
      streamUrl: '/api/extraction/stream/group-1',
    });
  });
});
