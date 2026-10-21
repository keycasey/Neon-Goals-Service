# AGENTS.md

Read `CLAUDE.md` before changing code. It is the canonical engineering guide.

## Tooling

- Use Bun for Nest and `uv` plus `worker/uv.lock` for Python.
- Preserve unrelated user changes and untracked files.
- Run `bun run verify` plus worker tests before handoff.

## Authentication

- JWT represents a real user and is required for user-owned data.
- `X-API-Key` is accepted only by controllers using `JwtOrApiKeyGuard`; it maps to the deliberately data-neutral agent identity and never impersonates a user.
- `X-Worker-Key` is for trusted backend-worker traffic only.
- Never add unauthenticated queue, callback, progress, debug, or data endpoints.

Inspect controllers and DTOs before automating an endpoint. Do not rely on copied endpoint inventories in prose.

## Deployment

Deployment is automatic on pushes to `main` through `.github/workflows/deploy.yml`. The backend is tested and health-checked before the workflow continues; Gilbert receives an immutable Git archive under `~/.local/share/neon-goals/releases/`, and `current` changes only after dependencies and worker tests pass. Do not deploy from or clean Gilbert's development checkout. Do not SSH-deploy unless Casey explicitly authorizes emergency intervention. Verify both the workflow and backend/worker health checks.
