import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import {
  AgentRunStatus,
  CreateRunInput,
  RecordAgentEventInput,
} from './agent-orchestrator.types';

@Injectable()
export class AgentOrchestratorService {
  constructor(private prisma: PrismaService) {}

  async createRun(input: CreateRunInput) {
    const run = await this.prisma.agentRun.create({
      data: {
        userId: input.userId,
        chatId: input.chatId,
        userMessageId: input.userMessageId,
        status: 'running',
      },
    });

    if (input.workItems.length > 0) {
      await this.prisma.agentWorkItem.createMany({
        data: input.workItems.map((item) => ({
          runId: run.id,
          userId: input.userId,
          kind: item.kind,
          assignedAgent: item.assignedAgent,
          status: 'pending',
          input: item.input as any,
        })),
      });
    }

    return run;
  }

  async recordEvent(input: RecordAgentEventInput) {
    return this.prisma.agentEvent.create({
      data: {
        runId: input.runId,
        workItemId: input.workItemId,
        chatId: input.chatId,
        userId: input.userId,
        agent: input.agent,
        eventType: input.eventType,
        content: input.content,
        visibility: input.visibility ?? 'hidden',
      },
    });
  }

  async completeRun(runId: string, status: Exclude<AgentRunStatus, 'running'>) {
    return this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
      },
    });
  }
}
