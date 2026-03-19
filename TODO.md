# TODO - Neon Goals Service

---

## Agent Redirect & Handoff System

### High Priority

- [ ] Add redirect command types to command parser
  - [x] `REDIRECT_TO_CATEGORY` - Redirect to items/finances/actions specialist
  - [x] `REDIRECT_TO_GOAL` - Redirect to specific goal view
  - [x] `REDIRECT_TO_OVERVIEW` - Redirect to overview agent

- [ ] Implement backend redirect handler (`src/modules/ai/goal-command.service.ts`)
  - [x] Handle `REDIRECT_TO_CATEGORY` - Get or create category chat
  - [x] Handle `REDIRECT_TO_GOAL` - Get or create goal view chat
  - [x] Handle `REDIRECT_TO_OVERVIEW` - Get overview chat
  - [x] Add redirect context message to new chat

- [ ] Add redirect output fields to agent signatures (if using DSPy)
  - [ ] `OverviewSignature`: `redirect_to_category`, `redirect_to_goal` (optional)
  - [ ] `ItemsSignature`: `redirect_to_overview`, `redirect_to_goal` (optional)
  - [ ] `GoalViewSignature`: `redirect_to_overview`, `redirect_to_category` (optional)

- [ ] Implement context preservation across agent handoffs
  - [x] Pass last N messages (5-10) when redirecting
  - [x] Include redirect reason in system message
  - [x] Maintain conversation thread ID history for tracking

- [ ] Create DSPy training data for redirect detection
  - [ ] Extract QA pairs from existing chat history
  - [ ] Write redirect detection training examples (30-50 examples)
  - [ ] Train redirect judge with GEPA optimization

### Medium Priority

- [ ] Prevent redirect loops
  - [ ] Track recent redirects per user (last 5 redirects)
  - [ ] Block redirect if target was recently visited
  - [ ] Provide manual navigation suggestion instead

- [ ] Handle edge cases in redirect handler
  - [x] Goal not found after redirect (graceful fallback to overview)
  - [ ] Category chat creation fails (retry with error message)
  - [ ] Concurrent redirects (serialize or queue)

- [ ] Add redirect metrics and logging
  - [x] Log all redirect decisions (agent → target, reason)
  - [ ] Track redirect acceptance rate (user clicks "Go" vs "Stay")
  - [ ] Monitor for redirect patterns that need adjustment

### Low Priority

- [ ] A/B test redirect suggestions
  - [ ] Measure engagement with vs. without redirects
  - [ ] Optimize redirect message wording

---

## DSPy Integration

### High Priority

- [ ] Add DSPy dependency to service
  - [ ] Evaluate: Python microservice vs Node.js wrapper
  - [ ] Set up DSPy environment (Python + MLflow for optimization tracking)

- [ ] Convert existing agent prompts to DSPy signatures
  - [x] Overview agent signature
  - [x] Category specialist signatures (items, finances, actions)
  - [x] Goal view agent signature
  - [x] Goal creation signature

- [x] Create prompt workspace under `prompts/`
  - [x] Add `uv`-managed Python project metadata
  - [x] Add DSPy-style signature definitions
  - [x] Add generator script for Nest-consumable prompt bundles
  - [x] Make Nest load generated prompt bundle by default when present

- [ ] Implement agent training pipeline
  - [ ] Extract QA pairs from database chat history
  - [ ] Clean and format into DSPy Examples
  - [ ] Split into train/dev sets (80/20 split)

- [ ] Run baseline evaluation
  - [ ] Evaluate current prompts on dev set
  - [ ] Record baseline scores for comparison

### Medium Priority

- [ ] Implement GEPA optimization
  - [ ] Set up Judge LLM (GPT-4 for quality evaluation)
  - [ ] Set up Teacher LLM (GPT-4-turbo for reflection)
  - [ ] Run GEPA with max 5 rounds of optimization
  - [ ] Compare before/after scores

- [ ] Store optimized prompts
  - [ ] Save optimized prompts to database/config
  - [ ] Add version control for prompt history
  - [ ] A/B test in production environment

---

## Agent Communication

- [ ] Update AGENTS.md with redirect system documentation
  - [x] Document redirect command formats
  - [x] Explain context preservation strategy
  - [x] Add examples of redirect flows

---

## Amazon Cart & Vehicle Upgrades

### High Priority

- [ ] Add "Amazon Cart" item goal source/metadata
  - [ ] Add `source: "amazon"` field to ItemGoalData
  - [ ] Track Amazon session ID for authenticated scraping
  - [ ] Support "Save for Later" items (not "Buy Later" goals)
  - [ ] Distinguish between cart items vs. wish list items

- [ ] Add "Vehicle Tinting" item goal subcategory
  - [ ] Use existing `ItemCategory.vehicle` for vehicle purchase goals
  - [ ] Use `ItemCategory.vehicle_parts` for tinting/accessories goals
  - [ ] Add `tintingType` metadata to ItemGoalData ("full_car", "rear_windows", "single_windows", "custom")
  - [ ] Add tinting budget field to ItemGoalData

- [ ] Implement Amazon scraper service (`src/modules/scraper/amazon.service.ts`)
  - [ ] Login flow (read session cookies from browser extension or manual paste)
  - [ ] "Save for Later" page scraper (extract items with titles, prices, ASINs)
  - [ ] Cart page scraper (extract all cart items with quantities)
  - [ ] **Organize into existing categories** — assign appropriate `ItemCategory` to each item:
    - `vehicle` for car parts, accessories
    - `technology` for electronics
    - `furniture` for home goods
    - `general` for mixed items
    - `clothing`, `pets`, etc. for other categories

- [ ] Evaluate: Expand `ItemCategory` enum if needed
  - [ ] Review current categories: vehicle, vehicle_parts, technology, sporting_goods, clothing, pets, furniture, general
  - [ ] Add categories if Amazon items don't fit existing ones (e.g., `shopping`, `home_goods`)
  - [ ] Consider using subcategories/tags instead of expanding enum
  - [ ] Document decision on whether to expand enum or use `category` string + validation

### Medium Priority

- [ ] Create ItemGroup model (Prisma)
  - [ ] Fields: id, name, description, userId
  - [ ] Support grouping scraped Amazon items into logical categories
  - [ ] Add CRUD operations for groups (GET/POST/PATCH/DELETE)

- [ ] Add bulk goal creation endpoint
  - [ ] `POST /goals/amazon/import` — Import scraped Amazon cart as goals
  - [ ] Group items during import (assign to ItemGroup)
  - [ ] Preserve ASINs for product lookup/price tracking

- [ ] Car tinting budget tracking
  - [ ] Add budget field to ItemGoalData for vehicle upgrades
  - [ ] Track tinting quote: $70 (full car), $400 (rear), $150 (single window)
  - [ ] Support custom amounts per tint type (user enters their own quotes)

- [ ] Amazon scraper agent (if using AI agents)
  - [ ] Create "Amazon Specialist" category agent
  - [ ] Train to help organize cart items into goal groups
  - [ ] Suggest pricing alerts for Amazon items

### Low Priority

- [ ] Chrome extension development (if needed for Amazon cookies)
  - [ ] Manifest, background script, popup UI
  - [ ] Cookie extraction from amazon.com domain
  - [ ] Message passing to Neon Goals UI

- [ ] Amazon price history tracking
  - [ ] Store historical prices for ASINs
  - [ ] Alert when price drops for saved items
  - [ ] Price trend visualization

---

## General Improvements
