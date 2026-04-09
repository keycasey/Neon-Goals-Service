import { BadRequestException, Injectable } from '@nestjs/common';

import { AiToolsService } from './ai-tools.service';

export interface DspySpecialistToolRequest {
  name: string;
  arguments: Record<string, unknown>;
}

@Injectable()
export class DspySpecialistToolsService {
  constructor(private readonly aiToolsService: AiToolsService) {}

  async execute(
    categoryId: string,
    userId: string,
    request: DspySpecialistToolRequest,
  ): Promise<{
    ok: true;
    name: string;
    result: unknown;
  }> {
    if (categoryId === 'finances' && request.name === 'get_financial_context') {
      return {
        ok: true,
        name: request.name,
        result: await this.aiToolsService.getFinancialContext(userId),
      };
    }

    throw new BadRequestException(
      `Unsupported DSPy specialist tool: ${categoryId}:${request.name}`,
    );
  }
}
