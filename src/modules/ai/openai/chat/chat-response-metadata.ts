import { ParsedCommand, ProposalType } from '../parsing/command-parser.types';

export interface RedirectProposalMetadata {
  target?: 'overview' | 'category' | 'goal';
  categoryId?: string;
  goalId?: string;
  goalTitle?: string;
  message?: string;
  reason?: string;
}

export interface DspyResponseMetadata {
  redirectProposal?: RedirectProposalMetadata;
  goalIntent?: string;
  matchedGoalId?: string;
  matchedGoalTitle?: string;
  targetCategory?: string;
  toolScope?: string[];
}

export interface AssistantResponseMetadata extends DspyResponseMetadata {
  commands?: ParsedCommand[];
  goalPreview?: string;
  awaitingConfirmation?: boolean;
  proposalType?: ProposalType;
  extraction?: {
    groupId: string;
    urls: string[];
    streamUrl: string;
  };
}

export interface BuildAssistantResponseMetadataInput {
  commands?: ParsedCommand[];
  dspyMetadata?: DspyResponseMetadata;
  goalPreview?: string;
  awaitingConfirmation?: boolean;
  proposalType?: ProposalType;
  extraction?: AssistantResponseMetadata['extraction'];
}

function isRedirectCommandType(type: string): boolean {
  return (
    type === 'REDIRECT_TO_CATEGORY' ||
    type === 'REDIRECT_TO_GOAL' ||
    type === 'REDIRECT_TO_OVERVIEW'
  );
}

function commandToRedirectProposal(command: ParsedCommand): RedirectProposalMetadata | undefined {
  const data = command.data || {};
  if (command.type === 'REDIRECT_TO_CATEGORY') {
    return {
      target: 'category',
      categoryId: typeof data.categoryId === 'string' ? data.categoryId : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  }

  if (command.type === 'REDIRECT_TO_GOAL') {
    return {
      target: 'goal',
      goalId: typeof data.goalId === 'string' ? data.goalId : undefined,
      goalTitle: typeof data.goalTitle === 'string' ? data.goalTitle : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  }

  if (command.type === 'REDIRECT_TO_OVERVIEW') {
    return {
      target: 'overview',
      message: typeof data.message === 'string' ? data.message : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
  }

  return undefined;
}

function deriveRedirectProposal(commands: ParsedCommand[] | undefined): RedirectProposalMetadata | undefined {
  if (!commands) {
    return undefined;
  }

  for (const command of commands) {
    if (isRedirectCommandType(command.type)) {
      return commandToRedirectProposal(command);
    }
  }

  return undefined;
}

function resolveProposalType(
  commands: ParsedCommand[] | undefined,
  dspyMetadata: DspyResponseMetadata | undefined,
  proposalType?: ProposalType,
): ProposalType | undefined {
  if (proposalType) {
    return proposalType;
  }

  if (dspyMetadata?.redirectProposal || deriveRedirectProposal(commands)) {
    return 'accept_decline';
  }

  if (commands?.some((command) => isRedirectCommandType(command.type))) {
    return 'accept_decline';
  }

  if (commands && commands.length > 0) {
    return 'confirm_edit_cancel';
  }

  return undefined;
}

function hasConfirmationState(
  commands: ParsedCommand[] | undefined,
  dspyMetadata: DspyResponseMetadata | undefined,
  awaitingConfirmation?: boolean,
): boolean | undefined {
  if (awaitingConfirmation !== undefined) {
    return awaitingConfirmation;
  }

  if (dspyMetadata?.redirectProposal) {
    return true;
  }

  if (commands && commands.length > 0) {
    return true;
  }

  return undefined;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

export function buildAssistantResponseMetadata(
  input: BuildAssistantResponseMetadataInput,
): AssistantResponseMetadata {
  const dspyMetadata = input.dspyMetadata || {};
  const commands = input.commands && input.commands.length > 0 ? input.commands : undefined;
  const redirectProposal = dspyMetadata.redirectProposal || deriveRedirectProposal(commands);
  const goalIntent =
    dspyMetadata.goalIntent ||
    (redirectProposal?.target === 'goal'
      ? 'route_to_goal'
      : redirectProposal?.target === 'category'
        ? 'route_to_category'
        : redirectProposal?.target === 'overview'
          ? 'route_to_overview'
          : undefined);
  const targetCategory =
    dspyMetadata.targetCategory ||
    redirectProposal?.categoryId ||
    (redirectProposal?.target === 'overview' ? 'overview' : undefined);
  const matchedGoalId = dspyMetadata.matchedGoalId || redirectProposal?.goalId;
  const matchedGoalTitle = dspyMetadata.matchedGoalTitle || redirectProposal?.goalTitle;
  const toolScope = dspyMetadata.toolScope ||
    (redirectProposal
      ? redirectProposal.target === 'goal'
        ? ['goal']
        : redirectProposal.target === 'category'
          ? ['overview', redirectProposal.categoryId || 'category']
          : ['overview']
      : undefined);

  return stripUndefined({
    commands,
    redirectProposal,
    goalIntent,
    matchedGoalId,
    matchedGoalTitle,
    targetCategory,
    toolScope,
    goalPreview: input.goalPreview,
    awaitingConfirmation: hasConfirmationState(commands, dspyMetadata, input.awaitingConfirmation),
    proposalType: resolveProposalType(commands, dspyMetadata, input.proposalType),
    extraction: input.extraction,
  });
}
