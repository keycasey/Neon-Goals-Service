import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { DspyWorkerService } from './dspy-worker.service';

const encoder = new TextEncoder();

function createSseStream(events: Array<Record<string, unknown>>, splitAt?: number): ReadableStream<Uint8Array> {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const chunks = splitAt && splitAt > 0 && splitAt < payload.length
    ? [payload.slice(0, splitAt), payload.slice(splitAt)]
    : [payload];

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('DspyWorkerService streaming', () => {
  beforeEach(() => {
    mock.restore();
  });

  it('streams incremental SSE chunks from the worker stream endpoint', async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toBe('http://worker.test/dspy/chat/stream');
      return {
        ok: true,
        body: createSseStream([
          { content: 'Hello ', done: false },
          { content: 'world', done: false },
          {
            content: '',
            done: true,
            commands: [{ type: 'REDIRECT_TO_CATEGORY', data: { categoryId: 'finances' } }],
            metadata: {
              redirectProposal: { target: 'category', categoryId: 'finances' },
              goalIntent: 'route_to_category',
              targetCategory: 'finances',
            },
          },
        ], 25),
      } as Response;
    });

    // @ts-expect-error test override
    global.fetch = fetchMock;

    const service = new DspyWorkerService({
      get: (key: string, fallback?: unknown) => {
        if (key === 'DSPY_WORKER_URL') return 'http://worker.test';
        if (key === 'DSPY_WORKER_TIMEOUT_MS') return fallback ?? 30000;
        return fallback;
      },
    } as any);

    const chunks = [] as any[];
    for await (const chunk of service.buildStreamChunks({
      chatType: 'overview',
      userMessage: 'Help me with my finances',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ content: 'Hello ', done: false });
    expect(chunks[1]).toEqual({ content: 'world', done: false });
    expect(chunks[2]).toMatchObject({
      done: true,
      commands: [{ type: 'REDIRECT_TO_CATEGORY', data: { categoryId: 'finances' } }],
      redirectProposal: { target: 'category', categoryId: 'finances' },
      goalIntent: 'route_to_category',
      targetCategory: 'finances',
    });
  });
});
