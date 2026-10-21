# Neon Goals Service development guide

## Non-negotiables

1. Use Bun for TypeScript dependencies and scripts; use `uv` for the worker.
2. Include a committed Prisma migration with every schema change.
3. Scope every user-owned database operation by authenticated `userId`.
4. Never return, log, or pass Plaid access tokens to controllers, prompts, or clients.
5. Worker-only routes require `X-Worker-Key`; browser/user routes require JWT or an explicitly documented agent-key guard.
6. Do not manually deploy. Merges to `main` use the deployment workflow.
7. Worker releases are immutable archives. Never deploy by stashing, pulling, or cleaning Gilbert's development checkout.

## Verification

```bash
bun install --frozen-lockfile
bun run verify
cd worker && uv sync --frozen --group dev && uv run --frozen --group dev pytest -q
```

For schema changes, also run `prisma migrate deploy` against an empty PostgreSQL database and verify `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` reports no drift.

## Components

- `auth`: GitHub and email/password authentication
- `goals`: item, finance, action, and group goals
- `chats` / `ai`: persistence, routing, and model integrations
- `plaid`: linking, encrypted Item credentials, sync, and normalized financial context
- `projections`: recurring cashflow and net-worth projections
- `scraper`: queued vehicle searches
- `extraction`: queued product extraction and authenticated SSE
- `worker`: FastAPI scraper/extraction/DSPy worker

## Integration rules

- `PlaidItem` is the credential boundary. `PLAID_TOKEN_ENCRYPTION_KEY` is mandatory in production.
- Queue polling uses an atomic conditional claim inside a transaction.
- Use the worker-supplied callback and progress URLs independently.
- Paths, Python executables, Chrome debugging URLs, and Claude config paths are environment-configurable.
- New scraper scripts live under `scripts/`, are registered in `worker/main.py`, return JSON-compatible data, and include a focused test.
- Production creates missing worker/Plaid encryption secrets once in the host `.env`; worker provider credentials live in a mode-0600 environment file, never in the systemd unit.

Documentation ownership: README is operator-facing; this file holds engineering invariants; AGENTS documents agent/auth behavior; TODO contains active work only.
