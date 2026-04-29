import { AssignedAgent, CreateWorkItemInput } from '../agent-orchestrator.types';

const splitRequests = (message: string): string[] =>
  message
    .split(/\s*,\s*|\s+and\s+|\.\s+/i)
    .map((part) => part.trim().replace(/^and\s+/i, ''))
    .filter(Boolean);

const classifyAgent = (text: string): AssignedAgent => {
  const lower = text.toLowerCase();

  if (/(afford|budget|net worth|cash flow|spending|saving|passport|forester)/.test(lower)) {
    return 'finances';
  }

  if (/(buy|trimmer|vape|product|price|link|setup)/.test(lower)) {
    return 'items';
  }

  if (/(add|setup|fix|test drive|learn|habit|skill|site|autohotkey)/.test(lower)) {
    return 'actions';
  }

  return 'orchestrator';
};

const classifyKind = (text: string, agent: AssignedAgent): CreateWorkItemInput['kind'] => {
  const lower = text.toLowerCase();

  if (/\?$|^(can|how|what|why|should|do)\b/.test(lower)) {
    return 'answer_question';
  }

  if (agent === 'finances' && /(afford|budget|net worth|cash flow|spending|saving)/.test(lower)) {
    return 'answer_question';
  }

  return 'create_goal';
};

export const decomposeUserMessage = (message: string): CreateWorkItemInput[] =>
  splitRequests(message).map((text) => {
    const assignedAgent = classifyAgent(text);

    return {
      kind: classifyKind(text, assignedAgent),
      assignedAgent,
      input: { text },
    };
  });
