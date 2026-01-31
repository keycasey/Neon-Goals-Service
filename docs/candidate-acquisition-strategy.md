# Candidate Acquisition Strategy

## Overview
When a user creates an item goal (e.g., "Sony WH-1000XM5 Headphones"), the scraper service automatically populates the `candidates` array with product listings from different retailers/sellers.

**Goal**: ONE goal → ONE item → MULTIPLE candidates (different places to buy it)

**Example**:
```
User creates goal: "Sony WH-1000XM5 Headphones"
                          ↓
Scraper finds candidates:
  - Amazon: $299 (new, Prime shipping)
  - Best Buy: $328 (new, in-store pickup)
  - eBay: $274.99 (refurbished)
  - B&H Photo: $348 (new, with case bundle)
                          ↓
Goal.candidates[] = [4 listings]
```

---

## Architecture: 3-Tier Scraping Strategy

### Tier 1: Fast Search (Primary) - web-search-prime + web-reader
**Use for**: Initial candidate discovery
**Speed**: ~2-3 seconds
**Reliability**: High (no bot detection)

```typescript
// Example: Populate candidates for a goal
async function acquireCandidates(goal: Goal): Promise<ProductCandidate[]> {
  // 1. Build search query from goal title
  const searchQuery = `${goal.title} for sale price`;

  // 2. Use web-search-prime to find listings
  const searchResults = await mcp_webSearchPrime({
    search_query: searchQuery,
    content_size: 'medium',
    location: 'us'
  });

  // 3. For each result, use web-reader to extract structured data
  const candidates = await Promise.all(
    searchResults.slice(0, 10).map(async (result) => {
      const pageData = await mcp_webReader({
        url: result.url,
        return_format: 'markdown',
        retain_images: true
      });

      // 4. Parse markdown to extract product details
      return extractProductData(pageData, {
        name: parseTitle(pageData),
        price: parsePrice(pageData),
        image: parseImage(pageData),
        retailer: result.website_name,
        url: result.url,
        condition: parseCondition(pageData),
        features: parseFeatures(pageData),
        rating: parseRating(pageData),
        inStock: parseStock(pageData),
      });
    })
  );

  return candidates;
}
```

**Pros**:
- No bot detection issues
- Fast and reliable
- Good for marketplaces with clean HTML
- Works for most sites

**Cons**:
- Limited to sites indexed by search
- Markdown parsing may miss some fields

---

### Tier 2: Stealth Scraping (Fallback) - Playwright + Stealth
**Use for**: Sites with anti-bot protection (Craigslist, Facebook Marketplace)
**Speed**: ~10-15 seconds
**Reliability**: Medium (requires maintenance)

```typescript
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

async function scrapeWithStealth(goalTitle: string): Promise<ProductCandidate[]> {
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to marketplace (e.g., eBay)
  await page.goto(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(goalTitle)}`);

  // Wait for listings to load
  await page.waitForSelector('.s-item', { timeout: 5000 });

  // Extract candidates
  const candidates = await page.$$eval('.s-item', (items) => {
    return items.slice(0, 10).map(item => ({
      id: item.getAttribute('data-item-id'),
      name: item.querySelector('.s-item__title')?.textContent,
      price: parseFloat(item.querySelector('.s-item__price')?.textContent?.replace(/[^0-9.]/g, '')),
      image: item.querySelector('.s-item__image img')?.src,
      url: item.querySelector('.s-item__link')?.href,
      retailer: 'eBay',
      condition: item.querySelector('.SECONDARY_INFO')?.textContent?.includes('Used') ? 'used' : 'new',
    }));
  });

  await browser.close();
  return candidates;
}
```

**Pros**:
- Can bypass most anti-bot measures
- Access to JavaScript-heavy sites
- Can handle infinite scroll

**Cons**:
- Slower (needs full browser)
- More resource intensive
- Selectors break when sites update

---

### Tier 3: Interactive Browser (Last Resort) - browser-use MCP
**Use for**: Complex sites requiring interaction (login, captcha, filtering)
**Speed**: ~20-30 seconds
**Reliability**: High (human-like interaction)

```typescript
async function browserUseScrape(goalTitle: string): Promise<ProductCandidate[]> {
  // Navigate to shopping site
  await mcp_chrome_devtools.navigate_page({
    url: 'https://www.amazon.com',
    type: 'url'
  });

  // Take snapshot to see page structure
  await mcp_chrome_devtools.take_snapshot({});

  // Fill search box
  await mcp_chrome_devtools.fill({
    uid: 'search-box-123',  // from snapshot
    value: goalTitle
  });

  // Click search button
  await mcp_chrome_devtools.click({ uid: 'search-btn-456' });

  // Wait for results
  await mcp_chrome_devtools.wait_for({ text: 'results for' });

  // Extract listing data from snapshot
  const snapshot = await mcp_chrome_devtools.take_snapshot({});

  return parseCandidatesFromSnapshot(snapshot);
}
```

**Pros**:
- Can handle any site complexity
- Solves captchas naturally
- Very reliable

**Cons**:
- Slowest approach
- Requires UI element identification
- Higher resource cost

---

## Denied Candidates Tracking

### Schema Update

```prisma
model ItemGoalData {
  // ... existing fields
  candidates           Json?  // Active candidates user can swipe through
  deniedCandidates     Json?  // Full ProductCandidate objects user swiped left on
}
```

### Why Track Full Objects?

**Benefits**:
1. ✅ View denied candidates later (e.g., "Show rejected" tab)
2. ✅ Filter them out during re-scraping (never show again)
3. ✅ "Un-deny" if user changes their mind
4. ✅ Track when they were denied (`deniedAt` timestamp)

### Deny Candidate Flow

```typescript
// When user swipes left in UI
POST /goals/:id/deny-candidate
{
  "candidateUrl": "https://ebay.com/itm/12345"
}

// Backend moves candidate from candidates[] to deniedCandidates[]
async denyCandidate(goalId: string, candidateUrl: string) {
  const goal = await prisma.goal.findUnique({ where: { id: goalId }, include: { itemData: true } });

  const candidates = goal.itemData.candidates || [];
  const deniedCandidates = goal.itemData.deniedCandidates || [];

  // Find candidate being denied
  const candidateToMove = candidates.find(c => c.url === candidateUrl);

  // Add denied timestamp
  const deniedCandidate = {
    ...candidateToMove,
    deniedAt: new Date().toISOString()
  };

  // Move from active to denied
  await prisma.itemGoalData.update({
    where: { goalId },
    data: {
      candidates: candidates.filter(c => c.url !== candidateUrl),
      deniedCandidates: [...deniedCandidates, deniedCandidate]
    }
  });
}
```

---

## Daily Re-Scraping Strategy

### Daily Cron Job

```typescript
@Cron('0 0 * * *') // Every day at midnight
async refreshAllActiveCandidates() {
  // Find all active item goals
  const activeGoals = await prisma.goal.findMany({
    where: {
      type: 'item',
      status: 'active'
    },
    include: { itemData: true }
  });

  // Queue each goal for re-scraping
  for (const goal of activeGoals) {
    await this.queueCandidateAcquisition(goal.id);
  }

  console.log(`✅ Queued ${activeGoals.length} goals for daily re-scraping`);
}
```

### Scraping with Denied Candidate Filtering

```typescript
async acquireCandidatesForGoal(goal: Goal): Promise<ProductCandidate[]> {
  // 1. Scrape fresh candidates from the web
  const freshCandidates = await this.scrapeFromWeb(goal.title);

  // 2. Get denied candidate URLs
  const deniedCandidates = goal.itemData?.deniedCandidates || [];
  const deniedUrls = new Set(deniedCandidates.map(c => c.url));

  // 3. Filter out denied candidates (user swiped left on these)
  const filteredCandidates = freshCandidates.filter(
    candidate => !deniedUrls.has(candidate.url)
  );

  // 4. Deduplicate by URL (same listing shouldn't appear twice)
  const uniqueCandidates = this.deduplicateByUrl(filteredCandidates);

  console.log(`Scraped ${freshCandidates.length} total candidates`);
  console.log(`Filtered out ${deniedUrls.size} denied candidates`);
  console.log(`Returning ${uniqueCandidates.length} unique new candidates`);

  return uniqueCandidates;
}

private deduplicateByUrl(candidates: ProductCandidate[]): ProductCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}
```

### What Happens During Daily Re-Scrape

**Day 1**: User creates goal → initial scrape
```json
candidates: [truck1, truck2, truck3]
deniedCandidates: []
```

**User swipes left on truck2**:
```json
candidates: [truck1, truck3]
deniedCandidates: [truck2]
```

**Day 2**: Daily re-scrape runs
- Scrapes fresh data: `[truck1, truck3, truck4, truck5]`
- Filters out denied: Remove truck2 (if still exists)
- truck1 & truck3 reappear ✅ (still for sale!)
- truck4 & truck5 are new ✅

```json
candidates: [truck1, truck3, truck4, truck5]
deniedCandidates: [truck2]  // Stays denied
```

**Day 10**: truck1 sold, new truck6 appears
```json
candidates: [truck3, truck4, truck5, truck6]  // truck1 naturally dropped
deniedCandidates: [truck2]  // Still denied
```

---

## Additional Features

### View Denied Candidates

```typescript
// API endpoint to view what user has denied
GET /goals/:id/denied-candidates

// Returns:
[
  {
    name: "2019 Toyota Tacoma",
    price: 26000,
    url: "https://autotrader.com/...",
    deniedAt: "2026-01-30T12:34:56Z"
  }
]
```

### Restore Denied Candidate

```typescript
// If user changes their mind
POST /goals/:id/restore-candidate
{
  "candidateUrl": "https://ebay.com/itm/12345"
}

// Moves candidate from deniedCandidates[] back to candidates[]
```

---

## Integration Flow

### When User Creates Goal

```typescript
// goals.controller.ts
@Post()
async createGoal(@Body() data: CreateGoalDto) {
  // 1. Create the goal
  const goal = await this.goalsService.createItemGoal(userId, data);

  // 2. Queue candidate acquisition (async)
  await this.scraperService.queueCandidateAcquisition(goal.id);

  // 3. Return goal immediately (candidates populated later)
  return goal;
}

// scraper.service.ts
async queueCandidateAcquisition(goalId: string) {
  // Add to simple jobs table
  await this.prisma.scrapeJob.create({
    data: {
      goalId,
      status: 'pending',
    },
  });
}
```

### Background Job Processor

```typescript
@Cron('*/2 * * * *') // Every 2 minutes
async processPendingJobs() {
  const jobs = await this.prisma.scrapeJob.findMany({
    where: {
      status: 'pending',
      attempts: { lt: 3 }
    },
    take: 5, // Process 5 at a time (rate limiting)
  });

  for (const job of jobs) {
    try {
      // Mark as running
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: { status: 'running' }
      });

      // Get the goal
      const goal = await this.prisma.goal.findUnique({
        where: { id: job.goalId },
        include: { itemData: true }
      });

      // Acquire candidates (filtered by denied list)
      const candidates = await this.acquireCandidatesForGoal(goal);

      // Update goal with new candidates
      await this.prisma.itemGoalData.update({
        where: { goalId: goal.id },
        data: { candidates }
      });

      // Mark job as complete
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: { status: 'completed' }
      });

      console.log(`✅ Populated ${candidates.length} candidates for goal: ${goal.title}`);

    } catch (error) {
      // Mark as failed, increment attempts
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          attempts: job.attempts + 1,
          error: error.message
        }
      });
      console.error(`❌ Failed to scrape for job ${job.id}:`, error);
    }
  }
}
```

---

## Data Extraction with LLM

After fetching page content (markdown from web-reader), use an LLM to extract structured data:

```typescript
async function extractProductData(markdown: string, baseData: Partial<ProductCandidate>): Promise<ProductCandidate> {
  const prompt = `
    Extract product information from this page:

    ${markdown}

    Return JSON with these fields (extract from page content):
    - name: string (product title)
    - price: number (in USD, numeric only)
    - condition: "new" | "used" | "refurbished"
    - rating: number (0-5, or null if not found)
    - reviewCount: number (or null)
    - inStock: boolean
    - estimatedDelivery: string (e.g., "2-3 days")
    - features: string[] (key product features)
    - savings: number (discount amount vs MSRP, or null)
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Fast + cheap for extraction
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });

  const extracted = JSON.parse(response.choices[0].message.content);

  return {
    id: `candidate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...baseData,
    ...extracted,
  };
}
```

---

## Site-Specific Scrapers

For best results, create specialized scrapers for popular marketplaces:

### Electronics
- **Amazon**: Tier 1 (web-search + web-reader)
- **Best Buy**: Tier 1
- **B&H Photo**: Tier 1
- **Newegg**: Tier 2 (anti-bot measures)

### Used Cars
- **Autotrader**: Tier 1
- **Cars.com**: Tier 1
- **Carvana**: Tier 1
- **Facebook Marketplace**: Tier 2 (requires stealth)
- **Craigslist**: Tier 2 (requires stealth)

### General
- **eBay**: Tier 1
- **Walmart**: Tier 2
- **Target**: Tier 2

---

## Simple Jobs Table Schema

```sql
CREATE TABLE scrape_jobs (
  id SERIAL PRIMARY KEY,
  goal_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  attempts INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_goal_id ON scrape_jobs(goal_id);
```

---

## Performance Expectations

| Approach | Speed | Success Rate | Candidates Returned |
|----------|-------|--------------|---------------------|
| web-search-prime + web-reader | 2-3s | 85% | 5-10 |
| Playwright + Stealth | 10-15s | 75% | 8-15 |
| browser-use MCP | 20-30s | 95% | 10-20 |

**With daily re-scraping**: Candidates always fresh (max 24 hours old).

---

## Example: Complete Flow

```typescript
// 1. User creates goal
const goal = await goalsService.createItemGoal(userId, {
  title: 'Sony WH-1000XM5 Headphones',
  description: 'Premium noise-canceling headphones',
  productImage: 'https://...',
  bestPrice: 0, // Will be updated by scraper
  retailerUrl: '',
  retailerName: '',
  statusBadge: 'pending_search',
});

// 2. Scraper queues job
await scraperService.queueCandidateAcquisition(goal.id);

// 3. Background processor runs (every 2 min)
const candidates = await scraperService.acquireCandidatesForGoal(goal);
// Returns:
// [
//   { name: "Sony WH-1000XM5 - Black", price: 299, retailer: "Amazon", ... },
//   { name: "Sony WH-1000XM5 - Blue", price: 328, retailer: "Best Buy", ... },
//   { name: "Sony WH-1000XM5 - Refurb", price: 274.99, retailer: "eBay", ... },
// ]

// 4. Update goal
await goalsService.updateItemGoal(goal.id, userId, {
  candidates,
  bestPrice: Math.min(...candidates.map(c => c.price)),
  statusBadge: 'price_drop',
});

// 5. User swipes left on eBay listing
await goalsService.denyCandidate(goal.id, 'https://ebay.com/itm/12345');
// candidates[] = [Amazon, Best Buy]
// deniedCandidates[] = [eBay listing + deniedAt timestamp]

// 6. Daily re-scrape (24 hours later)
// - Scrapes fresh Amazon, Best Buy, Walmart
// - Filters out eBay listing (in deniedCandidates)
// - Amazon & Best Buy reappear if still available
// - Walmart is new

// 7. User can view denied candidates
GET /goals/:id/denied-candidates
// Returns: [eBay listing with deniedAt timestamp]

// 8. User can restore if they change their mind
POST /goals/:id/restore-candidate
// Moves eBay listing back to candidates[]
```

---

## Summary

- ✅ **No cache table** - Always scrape fresh data
- ✅ **Daily re-scraping** - Candidates max 24 hours old
- ✅ **Denied candidates tracking** - Never show swiped-left items again
- ✅ **Full object storage** - Can view/restore denied candidates
- ✅ **Deduplication** - Same URL only appears once
- ✅ **3-tier fallback** - MCP → Stealth → browser-use
- ✅ **LLM extraction** - Clean data from any page format
- ✅ **Rate limiting** - Process 5 jobs every 2 minutes
- ✅ **Retry logic** - Max 3 attempts per job

**Total overhead**: One jobs table + denied candidates field + daily cron = minimal complexity.

**Candidate lifecycle**:
1. Scraped → appears in `candidates[]`
2. User denies → moves to `deniedCandidates[]`
3. Daily re-scrape → denied ones filtered out
4. User can view/restore denied candidates anytime
