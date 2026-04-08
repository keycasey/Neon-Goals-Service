# DSPy Specialist Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenAI-managed category specialist orchestration with DSPy-to-DSPy specialist handoffs that use explicit server-side tool execution, starting with finances and then applying the same contract to items and actions.

**Architecture:** Keep the existing Overview DSPy agent as the top-level router. Add a specialist tool-loop contract between the Nest service and the DSPy worker, cut finance over to that loop first, then migrate items and actions to the same specialist runtime while deleting the replaced OpenAI specialist paths.

**Tech Stack:** NestJS, TypeScript, Prisma, OpenAI SDK, Python, DSPy, pytest, bun test

---

## File Structure

### Existing Files To Modify

- `worker/dspy_pipeline/signatures.py`
  Defines DSPy signatures and program wrappers. Extend specialist signatures to emit structured tool requests and completion state.
- `worker/dspy_pipeline/live_chat.py`
  Current worker-side entry point for all DSPy chat runs. Split basic prediction from the new specialist tool loop and normalize richer metadata.
- `worker/main.py`
  Worker HTTP entrypoint. Keep endpoints stable while passing through richer request and response payloads.
- `src/modules/ai/openai/dspy-worker.service.ts`
  Nest-side worker client. Expand request types and preserve tool-loop metadata.
- `src/modules/ai/openai/chat/category.chat.ts`
  Current category specialist orchestrator. Replace OpenAI function-calling execution with DSPy specialist invocation and keep persistence logic intact.
- `src/modules/ai/ai-tools.service.ts`
  Existing specialist tool implementations. Add a narrow dispatch layer to make these callable by DSPy specialists.
- `src/modules/ai/ai.module.ts`
  Wire new specialist tool runner services into Nest DI.
- `src/modules/ai/openai/chat/dspy-chat-contract.ts`
  Normalize richer DSPy specialist responses into existing chat response shape.

### New Files To Create

- `worker/dspy_pipeline/specialist_loop.py`
  Owns the worker-side iterative DSPy specialist loop and tool-request protocol.
- `worker/tests/test_specialist_loop.py`
  Unit tests for the worker-side tool loop and bounded retry behavior.
- `src/modules/ai/dspy-specialist-tools.service.ts`
  Service-side allowlisted tool dispatcher for DSPy specialists.
- `src/modules/ai/dspy-specialist-tools.service.test.ts`
  Unit tests for tool dispatch and error envelopes.
- `src/modules/ai/openai/chat/category-dspy-context.ts`
  Builds normalized handoff payloads for specialist DSPy runs so `category.chat.ts` stays smaller.
- `src/modules/ai/openai/chat/category-dspy-context.test.ts`
  Unit tests for handoff payload shaping and account/goal context.

### Existing Tests To Extend

- `src/modules/ai/openai/dspy-worker.service.test.ts`
- `src/modules/ai/ai-tools.service.test.ts`
- `worker/tests/test_live_chat_streaming.py`

## Task 1: Define The DSPy Specialist Tool Contract

**Files:**
- Create: `worker/tests/test_specialist_loop.py`
- Modify: `worker/dspy_pipeline/signatures.py`
- Modify: `worker/dspy_pipeline/live_chat.py`

- [ ] **Step 1: Write the failing worker tests for specialist tool requests**

```python
from dspy_pipeline.specialist_loop import normalize_tool_request, should_continue_loop


def test_normalize_tool_request_accepts_valid_request():
    request = normalize_tool_request(
        {
            "name": "get_financial_context",
            "arguments": {"includeRecentTransactions": True},
        }
    )

    assert request == {
        "name": "get_financial_context",
        "arguments": {"includeRecentTransactions": True},
    }


def test_normalize_tool_request_rejects_invalid_payload():
    assert normalize_tool_request("not-json") is None
    assert normalize_tool_request({"name": "", "arguments": {}}) is None


def test_should_continue_loop_requires_pending_tool_requests():
    assert should_continue_loop({"toolRequests": [{"name": "get_financial_context", "arguments": {}}]}) is True
    assert should_continue_loop({"toolRequests": [], "handoffComplete": True}) is False
```

- [ ] **Step 2: Run the new worker tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service/worker && pytest tests/test_specialist_loop.py -q`
Expected: FAIL with `ModuleNotFoundError` for `dspy_pipeline.specialist_loop` or missing functions.

- [ ] **Step 3: Add specialist signature outputs for tool-driven specialists**

```python
class FinancesSignature(dspy.Signature):
    """Handle finance specialist messages, commands, redirects, and tool planning."""

    goal_context = dspy.InputField(desc="Visible finance goals plus recent chat context.")
    user_message = dspy.InputField(desc="The latest user message.")
    tool_results = dspy.InputField(desc="JSON array of prior tool results, or [] when none.")
    assistant_reply = dspy.OutputField(desc="Helpful finance-specialist reply.")
    commands = dspy.OutputField(desc="JSON array of structured commands or [].")
    tool_requests = dspy.OutputField(
        desc='JSON array like [{"name":"get_financial_context","arguments":{}}] or [].'
    )
    follow_up_question = dspy.OutputField(desc="Clarifying question when more input is required.")
    handoff_complete = dspy.OutputField(desc="true when the specialist is done, false otherwise.")
```

- [ ] **Step 4: Implement the worker-side helper module and wire it into live chat**

```python
# worker/dspy_pipeline/specialist_loop.py
from __future__ import annotations

from typing import Any


def normalize_tool_request(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    name = str(value.get("name") or "").strip()
    arguments = value.get("arguments") or {}
    if not name or not isinstance(arguments, dict):
        return None
    return {"name": name, "arguments": arguments}


def should_continue_loop(result: dict[str, Any]) -> bool:
    tool_requests = result.get("toolRequests") or []
    handoff_complete = bool(result.get("handoffComplete"))
    return bool(tool_requests) and not handoff_complete
```

- [ ] **Step 5: Update `live_chat.py` to expose tool requests and completion metadata**

```python
def _build_specialist_metadata(prediction: Any) -> dict[str, Any]:
    return {
        "toolRequests": _coerce_jsonish(_extract_prediction_field(prediction, "tool_requests")) or [],
        "followUpQuestion": _extract_prediction_field(prediction, "follow_up_question") or "",
        "handoffComplete": str(_extract_prediction_field(prediction, "handoff_complete")).lower() == "true",
    }
```

- [ ] **Step 6: Run worker tests again**

Run: `cd /home/trill/Development/neon/neon-goals-service/worker && pytest tests/test_specialist_loop.py -q`
Expected: PASS

- [ ] **Step 7: Commit the contract definition**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add worker/dspy_pipeline/signatures.py worker/dspy_pipeline/live_chat.py worker/dspy_pipeline/specialist_loop.py worker/tests/test_specialist_loop.py
git commit -m "Define DSPy specialist tool contract"
```

## Task 2: Add The Worker-Side Specialist Loop

**Files:**
- Modify: `worker/dspy_pipeline/specialist_loop.py`
- Modify: `worker/dspy_pipeline/live_chat.py`
- Test: `worker/tests/test_specialist_loop.py`
- Test: `worker/tests/test_live_chat_streaming.py`

- [ ] **Step 1: Write the failing loop test for iterative tool execution**

```python
from dspy_pipeline.specialist_loop import run_specialist_loop


class FakeProgram:
    def __init__(self):
        self.calls = 0

    def __call__(self, *, goal_context: str, user_message: str, tool_results: str):
        self.calls += 1
        if self.calls == 1:
            return {
                "assistant_reply": "",
                "commands": "[]",
                "tool_requests": '[{"name":"get_financial_context","arguments":{}}]',
                "follow_up_question": "",
                "handoff_complete": "false",
            }
        return {
            "assistant_reply": "Your recurring expenses are lower than your recurring income.",
            "commands": "[]",
            "tool_requests": "[]",
            "follow_up_question": "",
            "handoff_complete": "true",
        }


def test_run_specialist_loop_reinjects_tool_results():
    observed = []

    def tool_runner(request):
        observed.append(request)
        return {"ok": True, "result": {"netMonthlyCashflow": 1050}}

    result = run_specialist_loop(
        program=FakeProgram(),
        goal_context="finance context",
        user_message="How am I doing?",
        tool_runner=tool_runner,
        max_iterations=3,
    )

    assert observed == [{"name": "get_financial_context", "arguments": {}}]
    assert result["content"] == "Your recurring expenses are lower than your recurring income."
    assert result["metadata"]["usedTools"] == ["get_financial_context"]
```

- [ ] **Step 2: Run the worker tests to verify the loop test fails**

Run: `cd /home/trill/Development/neon/neon-goals-service/worker && pytest tests/test_specialist_loop.py -q`
Expected: FAIL with `ImportError` or missing `run_specialist_loop`.

- [ ] **Step 3: Implement the bounded specialist loop**

```python
def run_specialist_loop(*, program, goal_context: str, user_message: str, tool_runner, max_iterations: int = 4):
    tool_results: list[dict[str, Any]] = []
    used_tools: list[str] = []

    for _ in range(max_iterations):
        prediction = program(
            goal_context=goal_context,
            user_message=user_message,
            tool_results=json.dumps(tool_results),
        )
        result = normalize_specialist_prediction(prediction)
        if not should_continue_loop(result):
            result["metadata"] = {"usedTools": used_tools}
            return result

        next_requests = [normalize_tool_request(item) for item in result["toolRequests"]]
        next_requests = [item for item in next_requests if item]
        for request in next_requests:
            used_tools.append(request["name"])
            tool_results.append(
                {
                    "request": request,
                    "response": tool_runner(request),
                }
            )

    raise RuntimeError("DSPy specialist loop exceeded max iterations")
```

- [ ] **Step 4: Have `live_chat.py` call the loop for specialist chat types**

```python
if chat_type in {"items", "finances", "actions"}:
    result = run_specialist_loop(
        program=program,
        goal_context=context_value,
        user_message=user_message,
        tool_runner=lambda request: {
            "deferred": True,
            "request": request,
        },
    )
```

- [ ] **Step 5: Extend streaming tests to preserve final metadata**

```python
def test_build_stream_completion_event_includes_used_tools():
    event = build_stream_completion_event(
        content="Done",
        commands=[],
        metadata={"usedTools": ["get_financial_context"], "handoffComplete": True},
    )

    assert event["metadata"]["usedTools"] == ["get_financial_context"]
    assert event["metadata"]["handoffComplete"] is True
```

- [ ] **Step 6: Run worker tests**

Run: `cd /home/trill/Development/neon/neon-goals-service/worker && pytest tests/test_specialist_loop.py tests/test_live_chat_streaming.py -q`
Expected: PASS

- [ ] **Step 7: Commit the worker loop**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add worker/dspy_pipeline/live_chat.py worker/dspy_pipeline/specialist_loop.py worker/tests/test_specialist_loop.py worker/tests/test_live_chat_streaming.py
git commit -m "Add DSPy specialist tool loop"
```

## Task 3: Add The Nest Specialist Tool Dispatcher

**Files:**
- Create: `src/modules/ai/dspy-specialist-tools.service.ts`
- Create: `src/modules/ai/dspy-specialist-tools.service.test.ts`
- Modify: `src/modules/ai/ai.module.ts`
- Modify: `src/modules/ai/openai/dspy-worker.service.ts`

- [ ] **Step 1: Write the failing Nest tests for tool dispatch**

```typescript
import { DspySpecialistToolsService } from './dspy-specialist-tools.service';

describe('DspySpecialistToolsService', () => {
  it('dispatches get_financial_context for finance specialists', async () => {
    const aiTools = {
      getFinancialContext: jest.fn().mockResolvedValue({ netMonthlyCashflow: 1050 }),
    } as any;
    const service = new DspySpecialistToolsService(aiTools);

    await expect(
      service.execute('finances', 'user-1', {
        name: 'get_financial_context',
        arguments: {},
      }),
    ).resolves.toEqual({
      ok: true,
      name: 'get_financial_context',
      result: { netMonthlyCashflow: 1050 },
    });
  });
});
```

- [ ] **Step 2: Run the Nest tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/dspy-specialist-tools.service.test.ts`
Expected: FAIL with missing file or missing provider.

- [ ] **Step 3: Implement the allowlisted tool dispatcher**

```typescript
@Injectable()
export class DspySpecialistToolsService {
  constructor(private readonly aiToolsService: AiToolsService) {}

  async execute(categoryId: string, userId: string, request: { name: string; arguments: Record<string, unknown> }) {
    if (categoryId === 'finances' && request.name === 'get_financial_context') {
      return {
        ok: true,
        name: request.name,
        result: await this.aiToolsService.getFinancialContext(userId),
      };
    }

    throw new BadRequestException(`Unsupported DSPy specialist tool: ${categoryId}:${request.name}`);
  }
}
```

- [ ] **Step 4: Extend the worker service request contract for specialist metadata**

```typescript
export interface DspyChatRequest {
  chatType: 'overview' | 'items' | 'finances' | 'actions' | 'goal_view' | 'proposal' | 'redirect_judge';
  userMessage: string;
  conversationContext?: string;
  goals?: any[];
  recentMessages?: any[];
  currentGoal?: any;
  currentChatType?: string;
  userId?: string;
  chatId?: string;
  modelId?: string;
  specialistContext?: {
    handoffReason?: string;
    conversationSummary?: string;
    toolScope?: string[];
  };
}
```

- [ ] **Step 5: Register the new dispatcher in the AI module**

```typescript
@Module({
  imports: [ProjectionsModule],
  providers: [
    AiToolsService,
    DspySpecialistToolsService,
  ],
  exports: [AiToolsService, DspySpecialistToolsService],
})
export class AiModule {}
```

- [ ] **Step 6: Run Nest tests**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/dspy-specialist-tools.service.test.ts src/modules/ai/openai/dspy-worker.service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the dispatcher**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/dspy-specialist-tools.service.ts src/modules/ai/dspy-specialist-tools.service.test.ts src/modules/ai/ai.module.ts src/modules/ai/openai/dspy-worker.service.ts
git commit -m "Add DSPy specialist tool dispatcher"
```

## Task 4: Move Finance Specialist Handoff To DSPy

**Files:**
- Create: `src/modules/ai/openai/chat/category-dspy-context.ts`
- Create: `src/modules/ai/openai/chat/category-dspy-context.test.ts`
- Modify: `src/modules/ai/openai/chat/category.chat.ts`
- Modify: `src/modules/ai/openai/chat/dspy-chat-contract.ts`
- Test: `src/modules/ai/ai-tools.service.test.ts`

- [ ] **Step 1: Write the failing context-builder tests**

```typescript
import { buildCategoryDspyContext } from './category-dspy-context';

describe('buildCategoryDspyContext', () => {
  it('builds a finance handoff payload with tool scope', () => {
    const result = buildCategoryDspyContext({
      categoryId: 'finances',
      message: 'How much am I saving each month?',
      goals: [{ id: 'goal-1', title: 'Emergency Fund', type: 'finance' }],
      recentMessages: [{ role: 'user', content: 'Help me budget better' }],
    });

    expect(result.specialistContext).toEqual({
      handoffReason: 'user asked for finance specialist help',
      conversationSummary: expect.stringContaining('Help me budget better'),
      toolScope: ['finances'],
    });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category-dspy-context.test.ts`
Expected: FAIL with missing file or missing export.

- [ ] **Step 3: Implement the context builder**

```typescript
export function buildCategoryDspyContext(input: {
  categoryId: string;
  message: string;
  goals: any[];
  recentMessages: Array<{ role: string; content: string }>;
}) {
  return {
    chatType: input.categoryId as 'items' | 'finances' | 'actions',
    userMessage: input.message,
    goals: input.goals,
    recentMessages: input.recentMessages,
    specialistContext: {
      handoffReason: `user asked for ${input.categoryId} specialist help`,
      conversationSummary: input.recentMessages.map((entry) => `${entry.role}: ${entry.content}`).join('\n'),
      toolScope: [input.categoryId],
    },
  };
}
```

- [ ] **Step 4: Replace finance specialist fallback-to-OpenAI behavior in `category.chat.ts`**

```typescript
if (categoryId === 'finances') {
  const request = buildCategoryDspyContext({
    categoryId,
    message,
    goals: categoryGoals,
    recentMessages: persistedMessages,
  });

  const workerResponse = await this.dspyWorkerService.tryGenerateChat({
    ...request,
    userId,
    chatId,
    currentChatType: 'category',
  });

  if (!workerResponse) {
    throw new Error('Finance specialist DSPy worker unavailable');
  }
}
```

- [ ] **Step 5: Teach the DSPy chat contract to preserve `usedTools` and account metadata**

```typescript
const metadata = {
  ...(workerResponse.metadata || {}),
  usedTools: workerResponse.metadata?.usedTools || [],
  linkedAccountsConsidered: workerResponse.metadata?.linkedAccountsConsidered || [],
};
```

- [ ] **Step 6: Extend finance tool tests to assert `getFinancialContext` output is preserved**

```typescript
expect(result.recurringIncome[0]).toMatchObject({
  label: 'Payroll',
  averageMonthlyAmount: 4000,
});
expect(result.accountsWithoutTransactions).toEqual(['Capital One - 360 Performance Savings']);
```

- [ ] **Step 7: Run finance-focused tests**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category-dspy-context.test.ts src/modules/ai/ai-tools.service.test.ts src/modules/ai/openai/chat/dspy-chat-contract.test.ts`
Expected: PASS

- [ ] **Step 8: Commit the finance cutover**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/openai/chat/category-dspy-context.ts src/modules/ai/openai/chat/category-dspy-context.test.ts src/modules/ai/openai/chat/category.chat.ts src/modules/ai/openai/chat/dspy-chat-contract.ts src/modules/ai/ai-tools.service.test.ts
git commit -m "Cut finance specialist over to DSPy"
```

## Task 5: Remove OpenAI Finance Tool Calling And Add Regressions

**Files:**
- Modify: `src/modules/ai/openai/chat/category.chat.ts`
- Modify: `src/modules/ai/openai/chat/category.chat.ts`
- Test: `src/modules/ai/openai/chat/category.chat.test.ts` (create if absent)

- [ ] **Step 1: Write regression tests for the broken finance language**

```typescript
describe('CategoryChat finance DSPy behavior', () => {
  it('does not claim the user pasted transactions when linked financial context is used', async () => {
    const response = await service.categoryChat('user-1', 'finances', 'How am I doing?', [], 'chat-1');
    expect(response.content).not.toContain('you pasted');
  });

  it('does not say it cannot access linked accounts when tool metadata is present', async () => {
    const response = await service.categoryChat('user-1', 'finances', 'Analyze my spending', [], 'chat-1');
    expect(response.content).not.toContain("can't access your accounts");
  });
});
```

- [ ] **Step 2: Run the regression tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category.chat.test.ts`
Expected: FAIL because finance still falls back to OpenAI tool-calling or no test file exists.

- [ ] **Step 3: Delete the finance-specific OpenAI tool wiring**

```typescript
private buildFunctionTools(categoryId: string) {
  if (categoryId !== 'finances') {
    return undefined;
  }
  return undefined;
}
```

- [ ] **Step 4: Remove finance-only tool-call execution branches**

```typescript
if (categoryId === 'finances') {
  return this.tryDspyCategoryChat(userId, categoryId, message, categoryGoals, chatId);
}
```

- [ ] **Step 5: Run the regression suite and typecheck**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category.chat.test.ts src/modules/ai/openai/chat/dspy-chat-contract.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit the removal**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/openai/chat/category.chat.ts src/modules/ai/openai/chat/category.chat.test.ts
git commit -m "Remove OpenAI finance specialist orchestration"
```

## Task 6: Migrate Item Specialist To The Same DSPy Runtime

**Files:**
- Modify: `src/modules/ai/dspy-specialist-tools.service.ts`
- Modify: `src/modules/ai/openai/chat/category-dspy-context.ts`
- Modify: `src/modules/ai/openai/chat/category.chat.ts`
- Test: `src/modules/ai/dspy-specialist-tools.service.test.ts`

- [ ] **Step 1: Add failing tests for item tool allowlisting**

```typescript
it('rejects finance-only tools from the items specialist', async () => {
  await expect(
    service.execute('items', 'user-1', {
      name: 'get_financial_context',
      arguments: {},
    }),
  ).rejects.toThrow('Unsupported DSPy specialist tool');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/dspy-specialist-tools.service.test.ts`
Expected: FAIL because item allowlisting is not implemented yet.

- [ ] **Step 3: Extend the dispatcher with item-safe tools only**

```typescript
if (categoryId === 'items' && request.name === 'search_products') {
  return {
    ok: true,
    name: request.name,
    result: await this.aiToolsService.searchProducts(userId, request.arguments),
  };
}
```

- [ ] **Step 4: Cut item specialist routing to DSPy only**

```typescript
if (categoryId === 'items') {
  return this.tryDspyCategoryChat(userId, categoryId, message, categoryGoals, chatId);
}
```

- [ ] **Step 5: Run item-focused tests**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/dspy-specialist-tools.service.test.ts src/modules/ai/openai/chat/category-dspy-context.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the item cutover**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/dspy-specialist-tools.service.ts src/modules/ai/dspy-specialist-tools.service.test.ts src/modules/ai/openai/chat/category-dspy-context.ts src/modules/ai/openai/chat/category.chat.ts
git commit -m "Cut item specialist over to DSPy"
```

## Task 7: Migrate Action Specialist And Remove The Remaining OpenAI Category Path

**Files:**
- Modify: `src/modules/ai/dspy-specialist-tools.service.ts`
- Modify: `src/modules/ai/openai/chat/category.chat.ts`
- Modify: `src/modules/ai/openai/openai.service.ts`
- Test: `src/modules/ai/openai/chat/category.chat.test.ts`

- [ ] **Step 1: Write the failing action-specialist regression tests**

```typescript
it('routes action category messages through DSPy and preserves commands', async () => {
  const response = await service.categoryChat('user-1', 'actions', 'Break this into steps', [], 'chat-1');
  expect(response.commands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: expect.any(String) }),
    ]),
  );
});
```

- [ ] **Step 2: Run the action regression tests to verify they fail**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category.chat.test.ts`
Expected: FAIL because actions still use the old category path.

- [ ] **Step 3: Add action-safe tool dispatch and route actions to DSPy**

```typescript
if (categoryId === 'actions' && request.name === 'plan_action_steps') {
  return {
    ok: true,
    name: request.name,
    result: await this.aiToolsService.planActionSteps(userId, request.arguments),
  };
}
```

- [ ] **Step 4: Remove the remaining OpenAI category fallback orchestration**

```typescript
async categoryChat(...) {
  const dspyResponse = await this.tryDspyCategoryChat(userId, categoryId, message, categoryGoals, chatId);
  if (!dspyResponse) {
    throw new Error(`DSPy category worker unavailable for ${categoryId}`);
  }
  return dspyResponse;
}
```

- [ ] **Step 5: Run the final specialist suite**

Run: `cd /home/trill/Development/neon/neon-goals-service && bun test src/modules/ai/openai/chat/category.chat.test.ts src/modules/ai/dspy-specialist-tools.service.test.ts src/modules/ai/openai/dspy-worker.service.test.ts && cd worker && pytest tests/test_specialist_loop.py tests/test_live_chat_streaming.py -q && cd .. && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit the final cutover**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add src/modules/ai/dspy-specialist-tools.service.ts src/modules/ai/openai/chat/category.chat.ts src/modules/ai/openai/openai.service.ts src/modules/ai/openai/chat/category.chat.test.ts
git commit -m "Complete DSPy specialist migration"
```

## Task 8: Document Deployment And Replay Expectations

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-dspy-specialist-migration-design.md`
- Modify: `worker/README_DSPY.md`

- [ ] **Step 1: Write failing documentation checks by grepping for outdated specialist ownership**

Run: `cd /home/trill/Development/neon/neon-goals-service && rg -n "OpenAI function-calling path|Category specialist chat uses the OpenAI chat path" docs worker/README_DSPY.md`
Expected: matches in the migration spec or README that need updating after implementation.

- [ ] **Step 2: Update the spec and README with the final runtime**

```md
## Runtime Ownership

- Overview chat: DSPy router
- Category specialists: DSPy specialists with server-side tool execution
- Tool execution: Nest service allowlist via `DspySpecialistToolsService`
- Replay source of truth: worker metadata + Nest chat persistence
```

- [ ] **Step 3: Run the documentation grep again**

Run: `cd /home/trill/Development/neon/neon-goals-service && rg -n "OpenAI function-calling path|Category specialist chat uses the OpenAI chat path" docs worker/README_DSPY.md`
Expected: no matches

- [ ] **Step 4: Commit the docs update**

```bash
cd /home/trill/Development/neon/neon-goals-service
git add docs/superpowers/specs/2026-04-08-dspy-specialist-migration-design.md worker/README_DSPY.md
git commit -m "Document DSPy specialist runtime"
```

## Self-Review

### Spec Coverage

- Overview DSPy preserved: covered by Tasks 1, 2, 4, and 7.
- Specialist DSPy handoff contract: covered by Tasks 1 and 4.
- Server-side tool execution: covered by Tasks 2 and 3.
- Finance-first migration: covered by Tasks 3, 4, and 5.
- Item/action follow-on migrations: covered by Tasks 6 and 7.
- No feature flags: reflected in direct-cutover steps in Tasks 4 through 7.
- Observability and replay: covered by Tasks 2, 4, and 8.

### Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes file paths, commands, and concrete code examples.

### Type Consistency

- `toolRequests`, `followUpQuestion`, and `handoffComplete` are used consistently across worker and Nest plan tasks.
- `DspySpecialistToolsService.execute(categoryId, userId, request)` is consistent across dispatcher tasks.
- Specialist cutover always flows through `tryDspyCategoryChat(...)`.

