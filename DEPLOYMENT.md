# Deployment Guide

## Critical: Always Build After Pulling Code

**This project uses TypeScript**, which compiles to JavaScript in the `dist/` folder. When you pull code changes, the `dist/` folder becomes **stale** (outdated) and **MUST be rebuilt**.

### Why This Happens

- Source files: `src/**/*.ts` (TypeScript)
- Compiled files: `dist/**/*.js` (JavaScript from compilation)
- When you modify `.ts` files, `dist/*.js` files **do not auto-update**
- PM2 runs the **stale `dist/` files** unless you rebuild

### Correct Deployment Process

Production deploys are automatic when changes are pushed to `main`.

The `.github/workflows/deploy.yml` workflow runs on the self-hosted EC2 runner and:

1. Pulls `main` into `/var/www/Neon-Goals-Service`
2. Runs `bun install --frozen-lockfile`
3. Runs Prisma generate/migrate
4. Builds with `bun run build:deploy`
5. Restarts `pm2`
6. Deploys the worker

Verify deploys in the latest GitHub Actions `Deploy to EC2` run for the pushed commit.

Do not use an ad hoc backend SSH deploy unless the user explicitly asks for emergency/manual intervention.

#### For Gilbert (Worker):
```bash
./scripts/deploy-worker.sh
```

Or manually:
```bash
ssh gilbert "cd /home/alpha/Development/Neon-Goals-Service && git pull && sudo systemctl restart scraper-worker.service"
```

### What Each Step Does

| Step | Purpose |
|------|---------|
| `git pull` | Downloads latest source code (`.ts` files) |
| `bun run build:deploy` | Compiles TypeScript → JavaScript (updates `dist/`) |
| `pm2 restart` | Restarts service with fresh `dist/` files |

### Signs of Stale Dist Files

If you see errors like:
- `Error: Cannot find module 'X'` (but the file exists in `src/`)
- Old function behavior after code changes
- Hardcoded paths like `/home/trill/Development/` instead of dynamic paths
- Python script not found errors (wrong path)

**The fix is always to rerun the GitHub Actions deployment or rebuild with `bun run build:deploy` before restarting.**

### Quick Verification

After deployment, verify the build time:
```bash
ls -la dist/src/modules/scraper/vehicle-filter.service.js
```

The timestamp should match when you last deployed.

---

**Rule of thumb:** Production should deploy through the `main` branch GitHub Actions workflow. After any manual `git pull`, always run `bun run build:deploy` before restarting the service.
