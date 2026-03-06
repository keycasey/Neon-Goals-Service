# Demo Mode & Rate Limiting Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Implement chat rate limiting (20 messages/day) and a full-featured demo mode with automatic 30-minute reset and sandbox Plaid integration.

## Requirements

1. **Rate Limiting**: 20 AI chat messages per user per day, global across all chat types, resets at UTC midnight
2. **Demo Mode**: Accessible via UI login, resets every 30 minutes to seeded data
3. **Demo Plaid**: Always uses sandbox/mock data, never real Plaid API

---

## Section 1: Chat Rate Limiting

### Architecture

Add a `RateLimitService` that tracks daily message counts per user. The rate limit applies globally across all AI chat endpoints.

### Affected Endpoints

- `POST /ai/chat`
- `POST /ai/chat/stream`
- `POST /ai/overview/chat`
- `POST /ai/category/:categoryId/chat`
- `POST /ai/goal/:goalId/chat`

### Database Schema

```prisma
model UserUsage {
  id           String   @id @default(cuid())
  userId       String   @unique
  messageCount Int      @default(0)
  resetAt      DateTime // Next UTC midnight
  user         User     @relation(fields: [userId], references: [id])
}
```

### Flow

1. Before processing any AI chat message, check `UserUsage` for the user
2. If `resetAt` has passed, reset `messageCount` to 0 and set new `resetAt` to next UTC midnight
3. If `messageCount >= 20`, return 429 error with remaining time until reset
4. Otherwise, increment count and proceed

### Response Headers

- `X-RateLimit-Limit: 20`
- `X-RateLimit-Remaining: <count>`
- `X-RateLimit-Reset: <unix-timestamp>`

---

## Section 2: Demo User Reset (30-minute cron)

### Architecture

Create a `DemoResetService` with a cron job using `@nestjs/schedule`.

### Schedule

Runs every 30 minutes at `:00` and `:30` of each hour.

### Reset Flow

1. Cron fires
2. Service identifies demo user by email (`demo@goals-af.com`)
3. Transactional reset:
   - Delete all user's goals (cascades to itemData, financeData, actionData, messages, chats)
   - Delete user's Plaid accounts and transactions
   - Re-seed goals from the mock data structure
   - Re-create pre-linked sandbox Plaid account

### Seed Data

Create `prisma/seeds/demo-seed.ts` that mirrors the frontend's `mockGoals.ts` structure:

- 7 Item goals (headphones, macbook, chair, drone, longboard parts)
- 4 Finance goals (emergency fund, house down payment, investments, travel)
- 4 Action goals (learn Japanese, exercise routine, read books, launch side project)
- 4 Group goals (longboard build, home office, Japan trip, investment portfolio)

---

## Section 3: Demo User & Plaid Sandbox

### Demo Authentication

- Existing `/auth/demo` endpoint creates/returns demo user
- Add `isDemo: Boolean` field to User model
- Demo user gets standard JWT token (7-day expiration)

### Database Schema

```prisma
model User {
  // ... existing fields
  isDemo     Boolean    @default(false)
  usage      UserUsage?
}

model PlaidAccount {
  // ... existing fields
  isDemo     Boolean    @default(false)
}
```

### Plaid Sandbox Integration

Demo user always uses mock Plaid data:

- Pre-linked "Demo Bank - Checking" account with $5,000 balance
- Mock transactions for finance goal tracking
- No real Plaid API calls

### Behavior

- Demo user sees linked accounts in `/plaid/accounts`
- "Sync" operations return mock transaction data
- Demo user cannot link real Plaid accounts (blocked at `/plaid/create-link-token`)

---

## Section 4: Environment Variables

```env
# Demo User Configuration
DEMO_USER_EMAIL=demo@goals-af.com
DEMO_USER_RESET_INTERVAL_MINUTES=30

# Demo Plaid (always sandbox, even in production)
DEMO_PLAID_ENV=sandbox
```

### Logic

- `PLAID_ENV` - Controls real Plaid environment for production users
- `DEMO_PLAID_ENV` - Always `sandbox`, separate from production
- Demo user Plaid operations never hit real Plaid API

---

## Section 5: Implementation Plan

### New Files

```
src/
├── common/
│   └── services/
│       └── rate-limit.service.ts     # Message rate limiting
├── modules/
│   ├── auth/
│   │   └── demo-reset.service.ts     # Cron job for demo reset
│   └── plaid/
│       └── demo-plaid.service.ts     # Mock Plaid data for demo user
prisma/
├── schema.prisma                      # Add UserUsage, isDemo fields
└── seeds/
    └── demo-seed.ts                   # Goal seed data from mockGoals
```

### Modified Files

- `src/modules/ai/ai.controller.ts` - Add rate limit check before processing
- `src/modules/auth/auth.service.ts` - Set `isDemo: true` on demo user
- `src/modules/plaid/plaid.service.ts` - Block real Plaid for demo users
- `src/app.module.ts` - Import ScheduleModule

### Dependencies

- `@nestjs/schedule` - For cron jobs

### Migration Steps

1. Install `@nestjs/schedule`
2. Add `UserUsage` table and `isDemo` field to schema
3. Run `npx prisma migrate dev`
4. Create seed data file (`demo-seed.ts`)
5. Implement `RateLimitService`
6. Implement `DemoResetService`
7. Implement `DemoPlaidService`
8. Wire up rate limiting to AI endpoints
9. Wire up demo reset cron
10. Add environment variables to `.env.example`
