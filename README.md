# Neon Goals Service

Backend and worker services for Neon Goals: authenticated goal management, AI-assisted chats, Plaid-backed financial context, product extraction, and vehicle search.

## Stack

- NestJS 12 + TypeScript on Bun
- PostgreSQL + Prisma 6
- FastAPI worker managed with `uv`
- OpenAI/DSPy integrations
- Plaid for linked financial accounts

## Local setup

Requirements: Bun 1.3.9, PostgreSQL 16, Python 3.12+, and `uv`.

```bash
bun install --frozen-lockfile
cd worker && uv sync --frozen --group dev && cd ..
cp .env.example .env
bun run prisma:generate
bun run prisma:migrate
bun run dev:server
```

Run the worker separately with `bun run worker:dev`.

## Required configuration

```env
DATABASE_URL=postgresql://user:password@host:5432/neon_goals
JWT_SECRET=generate-a-long-random-secret
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=
OPENAI_API_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_TOKEN_ENCRYPTION_KEY=generate-a-long-random-secret
WORKER_API_KEY=generate-a-long-random-secret
AGENT_API_KEY=generate-a-different-long-random-secret
MCP_ENABLED=false
MCP_OAUTH_ENABLED=false
MCP_PUBLIC_BASE_URL=https://goals.keycasey.com/api
MCP_PERSONAL_GRANTS_ENABLED=false
```

Useful worker overrides are `NEON_GOALS_API_URL`, `WORKER_URL`, `SCRAPER_BASE_DIR`, `SCRAPER_PYTHON_BIN`, `CHROME_DEBUG_URL`, and `CLAUDE_CONFIG_DIR`.

Never reuse `WORKER_API_KEY` as a user or agent credential. Worker queue, callback, progress, and DSPy routes reject requests without it.

## ChatGPT and OpenClaw goals MCP

The stateless Streamable HTTP endpoint is `POST /api/mcp`. Public clients authenticate with OAuth 2.1 authorization code flow, S256 PKCE, dynamic client registration, rotating refresh tokens, and revocation:

```env
MCP_ENABLED=true
MCP_OAUTH_ENABLED=true
MCP_PUBLIC_BASE_URL=https://goals.keycasey.com/api
MCP_PERSONAL_GRANTS_ENABLED=false
```

Discovery documents are published at `/api/.well-known/oauth-protected-resource`, `/api/.well-known/oauth-protected-resource/mcp`, `/api/.well-known/oauth-authorization-server`, and `/api/.well-known/openid-configuration`. Available scopes are `goals:read` and `goals:write`.

Connect from OpenClaw through `mcporter`:

```bash
mcporter config add neon-goals https://goals.keycasey.com/api/mcp --auth oauth --scope home
mcporter auth neon-goals
mcporter list neon-goals --schema
```

For ChatGPT, add `https://goals.keycasey.com/api/mcp` as a custom MCP server/plugin and complete the hosted Neon Goals authorization page.

Private personal grants remain available only as an explicitly enabled operational fallback:

```bash
MCP_PERSONAL_GRANTS_ENABLED=true
bun run mcp:grant user@example.com 30 "Casey ChatGPT"
bun run mcp:revoke <grant-id>
```

OAuth access tokens, refresh tokens, authorization codes, and fallback personal grants are stored only as SHA-256 hashes. Revoke an OAuth connection from the client or via `POST /api/oauth/revoke`; revocation blocks the next MCP call.

## Commands

```bash
bun run verify             # Prisma client, backend tests, TypeScript build
bun test                   # Backend unit tests
bun run prisma:migrate     # Apply committed migrations
cd worker && uv run --frozen --group dev pytest -q
```

Every Prisma schema change must include a migration. CI proves the full history against clean PostgreSQL and rejects schema drift.

## Architecture rules

- User-owned reads and writes include authenticated `userId` in the database predicate.
- One `PlaidItem` owns an AES-256-GCM-encrypted access token; child account rows never duplicate credentials.
- AI code consumes normalized cached financial records, never provider credentials.
- Queue jobs are claimed with conditional updates so two workers cannot claim the same row.
- Extraction SSE is JWT-authenticated and filtered by group and user.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: locked install, Prisma generation, tests/build, migrations, restart, health check, and worker deployment. Do not manually deploy unless explicitly approved for emergency recovery.
