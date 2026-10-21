# Active technical roadmap

Keep this file limited to current, evidenced work. Completed history belongs in Git.

## Maintainability

- Split `scraper.service.ts` by retailer orchestration, filtering, and queue dispatch.
- Split `goal-command.service.ts` by command family.
- Split `plaid.service.ts` into provider client, linking, sync, and query services.
- Replace remaining broad `any` types at network and model-output boundaries with validated schemas.

## Product

- Build and evaluate redirect-detection training data for DSPy.
- Add redirect-loop protection and acceptance metrics.
- Treat read-only Neon finance tools as a secondary MCP phase; finance-boundary cleanup does not block goal CRUD.

## Coverage

- Add integration tests for worker authentication and extraction SSE isolation.
- Add PostgreSQL-backed concurrency tests for queue claims.
- Add migration-upgrade coverage with representative legacy Plaid rows.

## Operations

- Rotate the legacy worker provider credentials after confirming the new mode-0600 environment-file deployment is live.
- Drop the now-null `PlaidAccount.accessToken` and `PlaidAccount.itemId` compatibility columns in a follow-up migration after the encrypted-token release is stable.
