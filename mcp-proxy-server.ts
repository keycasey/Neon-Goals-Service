/**
 * MCP Proxy Server
 *
 * This server runs alongside the NestJS service and provides HTTP endpoints
 * that proxy requests to Claude Code MCPs (web-search-prime, web-reader, etc.)
 *
 * Why? MCPs are only available in Claude Code context, not in Node.js services.
 * This proxy bridges that gap.
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = 3002;

// This is a placeholder - the actual MCP calls would need to be made
// by Claude Code in response to HTTP requests to this server

app.post('/scrape/search', async (req, res) => {
  const { query } = req.body;

  console.log(`🔍 Received search request for: ${query}`);

  // TODO: This endpoint would need to trigger Claude Code to call:
  // - mcp__web-search-prime__webSearchPrime({ search_query: query })
  // - mcp__web-reader__webReader({ url: result.url }) for each result

  res.json({
    error: 'MCP proxy not fully implemented yet',
    message: 'This requires Claude Code to actively call MCPs and return results',
    query,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Proxy Server running on http://localhost:${PORT}`);
  console.log('   Waiting for scrape requests from NestJS service...');
});
