import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { McpAuthGuard, McpRequest } from './mcp-auth.guard';
import { McpServerFactory } from './mcp-server.factory';

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async post(@Req() request: McpRequest, @Res() response: Response) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.factory.create(request.mcpPrincipal!);
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  get(@Req() _request: Request, @Res() response: Response) {
    response.status(405).setHeader('Allow', 'POST').send('Stateless MCP accepts POST requests only');
  }
}
