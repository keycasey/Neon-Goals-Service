# Remote Scraper Worker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Offload scraping execution from EC2 NestJS server to remote Arch Linux machine (gilbert) with GUI access for Kitty terminal-based scrapers.

**Architecture:**
- NestJS (EC2) dispatches scraping jobs via HTTP to Arch worker (100.91.29.119:5000)
- Arch worker runs scrapers in Kitty terminal windows (instance-group: "scrapers")
- Worker executes scraping and sends results back to NestJS via callback URL
- NestJS receives results and saves to database

**Tech Stack:**
- Remote: FastAPI (Python), uvicorn, systemd
- NestJS: HttpService, new callback endpoint
- Transport: HTTP over Tailscale VPN

---

## Task 1: Create Worker Directory Structure

**Files:**
- Create: `worker/`
- Create: `worker/main.py`
- Create: `worker/requirements.txt`
- Create: `worker/pyproject.toml`

**Step 1: Create worker directory**

```bash
mkdir -p /home/trill/Development/neon-goals-service/worker
```

**Step 2: Create requirements.txt**

Create `worker/requirements.txt`:
```txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
python-multipart==0.0.9
requests==2.32.3
pydantic==2.9.2
```

**Step 3: Create pyproject.toml**

Create `worker/pyproject.toml`:
```toml
[project]
name = "scraper-worker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "requests>=2.32.3",
    "pydantic>=2.9.2",
]

[project.scripts]
start = "uvicorn main:app --host 0.0.0.0 --port 5000"
```

---

## Task 2: Implement FastAPI Worker (worker/main.py)

**Files:**
- Create: `worker/main.py`

**Step 1: Write the main worker application**

Create `worker/main.py`:
```python
import subprocess
import os
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, Request, HTTPException
from fastapi.responses import JSONResponse
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Scraper Worker", version="0.1.0")

# Base directory for scrapers (relative to worker dir)
SCRAPER_BASE_DIR = "/home/alpha/Development/neon-goals-service"
SCRIPTS_BASE_DIR = os.path.join(SCRAPER_BASE_DIR, "scripts")

# Scraper script mapping
SCRAPER_SCRIPTS: Dict[str, str] = {
    "cargurus-camoufox": "scrape-cars-camoufox.py",
    "carmax": "scrape-carmax.py",
    "autotrader": "scrape-autotrader.py",
    "kbb": "scrape-kbb.py",
    "truecar": "scrape-truecar.py",
    "carvana": "scrape-carvana-interactive.py",
    "browser-use": "scrape-cars.py",
}


def run_scraper_and_callback(
    scraper_name: str,
    query: str,
    vehicle_filters: Optional[Dict[str, Any]],
    job_id: str,
    callback_url: str
) -> None:
    """
    Run the scraper in a Kitty window and send results back via callback.

    This function runs in a background task after the HTTP response is sent.
    """
    try:
        logger.info(f"Starting scraper: {scraper_name} for job {job_id}")

        # Get the script path
        script_name = SCRAPER_SCRIPTS.get(scraper_name)
        if not script_name:
            raise ValueError(f"Unknown scraper: {scraper_name}")

        script_path = os.path.join(SCRIPTS_BASE_DIR, script_name)

        if not os.path.exists(script_path):
            raise FileNotFoundError(f"Script not found: {script_path}")

        # Build the command for Kitty with instance-group
        # This allows multiple Kitty windows to share the same process group
        command = [
            "kitty",
            "--single-instance",
            "--instance-group", "scrapers",
            "python3", script_path, query, "5"  # 5 = max results
        ]

        # Add vehicle filters as JSON argument if provided
        if vehicle_filters:
            command.append(str(vehicle_filters))

        logger.info(f"Running command: {' '.join(command)}")

        # Run the scraper and capture output
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=180,  # 3 minute timeout
            env={
                **os.environ,
                "DISPLAY": os.environ.get("DISPLAY", ":0"),
                "XAUTHORITY": os.environ.get("XAUTHORITY", "/home/alpha/.Xauthority"),
            }
        )

        if result.returncode != 0:
            error_msg = result.stderr or "Unknown error"
            logger.error(f"Scraper failed: {error_msg}")

            # Send error callback
            requests.post(
                callback_url,
                json={
                    "jobId": job_id,
                    "scraper": scraper_name,
                    "status": "error",
                    "error": error_msg,
                    "data": None
                },
                timeout=10
            )
            return

        # Parse the JSON output
        try:
            listings = result.stdout.strip()
            if not listings:
                raise ValueError("Empty output from scraper")

            data = eval(listings)  # Safe here as we control the scraper output

            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) and "error" in data[0]:
                raise ValueError(data[0]["error"])

            logger.info(f"Scraper returned {len(data)} listings")

            # Send success callback
            requests.post(
                callback_url,
                json={
                    "jobId": job_id,
                    "scraper": scraper_name,
                    "status": "success",
                    "error": None,
                    "data": data
                },
                timeout=10
            )

        except Exception as e:
            logger.error(f"Failed to parse scraper output: {e}")

            # Send error callback
            requests.post(
                callback_url,
                json={
                    "jobId": job_id,
                    "scraper": scraper_name,
                    "status": "error",
                    "error": str(e),
                    "data": None
                },
                timeout=10
            )

    except subprocess.TimeoutExpired:
        error_msg = f"Scraper timeout after 180 seconds"
        logger.error(error_msg)

        requests.post(
            callback_url,
            json={
                "jobId": job_id,
                "scraper": scraper_name,
                "status": "error",
                "error": error_msg,
                "data": None
            },
            timeout=10
        )

    except Exception as e:
        logger.error(f"Failed to run scraper: {e}")

        try:
            requests.post(
                callback_url,
                json={
                    "jobId": job_id,
                    "scraper": scraper_name,
                    "status": "error",
                    "error": str(e),
                    "data": None
                },
                timeout=10
            )
        except Exception as callback_error:
            logger.error(f"Failed to send error callback: {callback_error}")


@app.get("/health")
async def health_check():
    """Health check endpoint for systemd monitoring."""
    return {"status": "healthy", "service": "scraper-worker"}


@app.post("/run/{scraper_name}")
async def trigger_scraper(
    scraper_name: str,
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Trigger a scraper to run in a Kitty terminal window.

    The scraper runs asynchronously and calls back with results when complete.
    """
    # Validate scraper name
    if scraper_name not in SCRAPER_SCRIPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scraper: {scraper_name}. Available: {list(SCRAPER_SCRIPTS.keys())}"
        )

    # Get request body
    body = await request.json()

    job_id = body.get("jobId")
    query = body.get("query")
    vehicle_filters = body.get("vehicleFilters")

    if not job_id:
        raise HTTPException(status_code=400, detail="Missing required field: jobId")

    if not query:
        raise HTTPException(status_code=400, detail="Missing required field: query")

    # Build callback URL from origin IP
    origin_ip = request.client.host
    callback_url = f"http://{origin_ip}:3000/scrapers/callback"

    logger.info(f"Dispatching scraper: {scraper_name} for job {job_id}")
    logger.info(f"Query: {query}")
    logger.info(f"Callback URL: {callback_url}")

    # Add background task to run scraper
    background_tasks.add_task(
        run_scraper_and_callback,
        scraper_name,
        query,
        vehicle_filters,
        job_id,
        callback_url
    )

    return {
        "status": "dispatched",
        "jobId": job_id,
        "scraper": scraper_name,
        "message": f"Scraper {scraper_name} is running in background"
    }


@app.get("/")
async def root():
    """Root endpoint with service information."""
    return {
        "service": "Scraper Worker",
        "version": "0.1.0",
        "available_scrapers": list(SCRAPER_SCRIPTS.keys()),
        "endpoints": {
            "health": "/health",
            "run_scraper": "/run/{scraper_name}",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
```

---

## Task 3: Create NestJS Scraper Callback Module

**Files:**
- Create: `src/modules/scraper/scraper.controller.ts`
- Modify: `src/modules/scraper/scraper.module.ts` (add HttpModule)
- Modify: `src/modules/scraper/scraper.service.ts` (add dispatch method)

**Step 1: Create scraper controller**

Create `src/modules/scraper/scraper.controller.ts`:
```typescript
import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ScraperService } from './scraper.service';

interface CallbackData {
  jobId: string;
  scraper: string;
  status: 'success' | 'error';
  error?: string;
  data: any;
}

@Controller('scrapers')
export class ScraperController {
  private readonly logger = new Logger(ScraperController.name);

  constructor(private scraperService: ScraperService) {}

  @Post('callback')
  async handleCallback(@Body() callbackData: CallbackData) {
    this.logger.log(`Received callback for job ${callbackData.jobId}: ${callbackData.status}`);

    if (callbackData.status === 'error') {
      this.logger.error(`Job ${callbackData.jobId} failed: ${callbackData.error}`);
      await this.scraperService.handleJobError(callbackData.jobId, callbackData.error);
      return { acknowledged: true, status: 'error' };
    }

    this.logger.log(`Job ${callbackData.jobId} succeeded with ${callbackData.data?.length || 0} results`);
    await this.scraperService.handleJobSuccess(callbackData.jobId, callbackData.data);

    return { acknowledged: true, status: 'success' };
  }
}
```

**Step 2: Update scraper module**

Edit `src/modules/scraper/scraper.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { PrismaService } from '../../config/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [ScraperController],
  providers: [ScraperService, PrismaService],
  exports: [ScraperService],
})
export class ScraperModule {}
```

**Step 3: Add callback handling methods to scraper service**

Add these methods to `src/modules/scraper/scraper.service.ts`:

```typescript
  // Add imports at top
  import { HttpService } from '@nestjs/axios';
  import { firstValueFrom } from 'rxjs';

  // Update constructor
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

  // Add these new methods

  /**
   * Dispatch a scraping job to the remote worker
   */
  async dispatchJobToWorker(goalId: string): Promise<void> {
    const job = await this.prisma.scrapeJob.findUnique({
      where: { id: goalId },
      include: {
        goal: {
          include: {
            itemData: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${goalId}`);
    }

    const workerUrl = 'http://100.91.29.119:5000';
    const query = job.goal.itemData?.searchTerm || job.goal.title;
    const vehicleFilters = job.goal.itemData?.searchFilters || null;

    // Determine which scraper to use based on category
    const category = job.goal.itemData?.category || 'general';

    // Map category to scraper name
    const scraperMap: Record<string, string> = {
      'vehicle': 'cargurus-camoufox', // Default for vehicles
      'technology': 'browser-use',
      'furniture': 'browser-use',
      'sporting_goods': 'browser-use',
      'clothing': 'browser-use',
      'pets': 'browser-use',
      'vehicle_parts': 'browser-use',
    };

    const scraperName = scraperMap[category] || 'browser-use';

    try {
      await firstValueFrom(
        this.httpService.post(`${workerUrl}/run/${scraperName}`, {
          jobId: job.id,
          query,
          vehicleFilters: vehicleFilters,
        })
      );

      // Mark as dispatched
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: { status: 'dispatched' },
      });

      this.logger.log(`✅ Dispatched job ${job.id} to worker (scraper: ${scraperName})`);
    } catch (error) {
      this.logger.error(`Failed to dispatch job ${job.id}: ${error.message}`);

      // Mark as failed
      await this.prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          error: `Failed to dispatch to worker: ${error.message}`,
        },
      });

      throw error;
    }
  }

  /**
   * Handle successful callback from worker
   */
  async handleJobSuccess(jobId: string, data: any[]): Promise<void> {
    const job = await this.prisma.scrapeJob.findUnique({
      where: { id: jobId },
      include: { goal: { include: { itemData: true } } },
    });

    if (!job) {
      this.logger.warn(`Received callback for unknown job: ${jobId}`);
      return;
    }

    // Get denied and shortlisted candidates to filter out
    const deniedCandidates = (job.goal.itemData?.deniedCandidates as any[]) || [];
    const shortlistedCandidates = (job.goal.itemData?.shortlistedCandidates as any[]) || [];
    const existingCandidates = (job.goal.itemData?.candidates as any[]) || [];

    const deniedUrls = new Set(deniedCandidates.map((c) => c.url));
    const shortlistedUrls = new Set(shortlistedCandidates.map((c) => c.url));
    const existingUrls = new Set(existingCandidates.map((c) => c.url));
    const excludedUrls = new Set([...deniedUrls, ...shortlistedUrls, ...existingUrls]);

    // Filter and convert data
    const candidates = data
      .filter((item: any) => item.url && !excludedUrls.has(item.url))
      .map((item: any, index: number) => ({
        id: `${item.retailer?.toLowerCase() || 'scraper'}-${Date.now()}-${index}`,
        name: item.name,
        price: Math.round(item.price) || 0,
        retailer: item.retailer || 'Unknown',
        url: item.url,
        image: item.image || this.getRandomTruckImage(),
        condition: item.condition || 'used',
        rating: item.rating || 4.5,
        reviewCount: item.reviewCount || 50,
        inStock: item.inStock !== false,
        estimatedDelivery: item.location || 'Contact seller',
        features: item.mileage ? [`${item.mileage} mi`] : [],
      }));

    // Update goal with candidates
    const statusBadge = candidates.length > 0 ? 'in_stock' : 'not_found';

    await this.prisma.itemGoalData.update({
      where: { goalId: job.goal.id },
      data: {
        candidates: candidates as any,
        statusBadge: statusBadge,
        productImage: candidates[0]?.image || job.goal.itemData?.productImage,
        searchTerm: job.goal.itemData?.searchTerm || job.goal.title,
        category: job.goal.itemData?.category || 'vehicle',
      },
    });

    // Mark job as complete
    await this.prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        error: candidates.length === 0 ? 'No candidates found' : null,
      },
    });

    this.logger.log(`✅ Job ${jobId} completed with ${candidates.length} candidates`);
  }

  /**
   * Handle error callback from worker
   */
  async handleJobError(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        error: errorMessage,
      },
    });

    this.logger.error(`❌ Job ${jobId} failed: ${errorMessage}`);
  }
```

---

## Task 4: Create Deployment Script (deploy.sh)

**Files:**
- Create: `scripts/deploy-worker.sh`

**Step 1: Create the deployment script**

Create `scripts/deploy-worker.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 Deploying scraper worker to Gilbert..."

# 1. Update the code on the remote machine
echo "📥 Pulling latest code..."
ssh gilbert "cd ~/Development/neon-goals-service && git pull"

# 2. Restart the worker service to apply changes
echo "🔄 Restarting scraper-worker service..."
ssh gilbert "sudo systemctl restart scraper-worker"

# 3. Check service status
echo "✅ Checking service status..."
ssh gilbert "sudo systemctl status scraper-worker --no-pager | head -n 10"

echo "✅ Repo updated and Scraper Worker restarted on Gilbert."
```

**Step 2: Make script executable**

```bash
chmod +x /home/trill/Development/neon-goals-service/scripts/deploy-worker.sh
```

---

## Task 5: Remote Setup Instructions (Manual on Gilbert)

**Files:**
- Remote: `/etc/systemd/system/scraper-worker.service`
- Remote: Install dependencies via pacman

**Step 1: Install Python dependencies on Gilbert**

Run on Gilbert (Arch machine):
```bash
sudo pacman -S --needed python python-pip uvicorn python-fastapi kitty-terminfo
```

**Step 2: Create systemd service file on Gilbert**

Create `/etc/systemd/system/scraper-worker.service` on Gilbert:
```ini
[Unit]
Description=FastAPI Scraper Worker
After=network.target tailscaled.service
Wants=sys-subsystem-net-devices-tailscale0.device

[Service]
User=alpha
Group=alpha
WorkingDirectory=/home/alpha/Development/neon-goals-service/worker

# Set DISPLAY so Kitty knows where to open
Environment=DISPLAY=:0
# Point to your .Xauthority so it has permission to draw on the screen
Environment=XAUTHORITY=/home/alpha/.Xauthority

ExecStart=/usr/bin/python3 -m uvicorn main:app --host 100.91.29.119 --port 5000
Restart=always

[Install]
WantedBy=multi-user.target
```

**Step 3: Enable and start the service on Gilbert**

Run on Gilbert:
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable scraper-worker

# Start the service now
sudo systemctl start scraper-worker

# Check status
sudo systemctl status scraper-worker
```

**Step 4: Configure firewall (if needed)**

Run on Gilbert:
```bash
# Allow Tailscale interface traffic
sudo ufw allow in on tailscale0 to any port 5000
```

---

## Task 6: Update ScraperService to Use Worker

**Files:**
- Modify: `src/modules/scraper/scraper.service.ts`

**Step 1: Modify processPendingJobs to dispatch to worker**

Edit the `processPendingJobs` method in `src/modules/scraper/scraper.service.ts`:

Replace the local scraping logic with worker dispatch:

```typescript
  @Cron('*/2 * * * *')
  async processPendingJobs() {
    const jobs = await this.prisma.scrapeJob.findMany({
      where: {
        status: 'pending',
        attempts: { lt: 3 },
      },
      take: 5,
      include: {
        goal: {
          include: {
            itemData: true,
          },
        },
      },
    });

    if (jobs.length === 0) {
      return;
    }

    this.logger.log(`Processing ${jobs.length} pending scrape jobs...`);

    for (const job of jobs) {
      try {
        // Check if category is supported
        const category = job.goal.itemData?.category || 'general';
        const supportedCategories = ['vehicle', 'technology', 'furniture', 'sporting_goods', 'clothing', 'pets', 'vehicle_parts'];

        if (!supportedCategories.includes(category)) {
          this.logger.log(`⏭️ Skipping goal "${job.goal.title}" - category "${category}" not yet supported`);

          await this.prisma.itemGoalData.update({
            where: { goalId: job.goal.id },
            data: { statusBadge: 'not_supported' },
          });

          await this.prisma.scrapeJob.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              error: `Category "${category}" not yet supported. Supported: ${supportedCategories.join(', ')}`,
            },
          });
          continue;
        }

        // Dispatch to remote worker instead of running locally
        await this.dispatchJobToWorker(job.id);

      } catch (error) {
        await this.prisma.scrapeJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            attempts: job.attempts + 1,
            error: error.message,
          },
        });
        this.logger.error(`❌ Failed to dispatch job ${job.id}:`, error);
      }
    }
  }
```

**Step 2: Remove or deprecate old local scraping methods**

Optional: Comment out or remove `scrapeWithCamoufox` and `scrapeWithBrowserUse` methods as they're no longer used.

---

## Task 7: Test the Integration

**Files:**
- None (testing)

**Step 1: Test worker health endpoint**

From local machine:
```bash
curl http://100.91.29.119:5000/health
```

Expected: `{"status":"healthy","service":"scraper-worker"}`

**Step 2: Test scraper dispatch**

Create a test scrape job and verify callback:

```bash
# From NestJS server, trigger a job
# Or wait for cron to pick up pending jobs
```

Check logs on both machines:
- NestJS: Check for callback receipts
- Gilbert: Check for Kitty windows opening

**Step 3: Verify callback results**

```bash
# Check database for updated candidates
# Verify goal has new candidates populated
```

---

## Task 8: Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/scraper-worker-setup.md`

**Step 1: Update README**

Add section to `README.md`:
```markdown
## Remote Scraper Worker

The scraper service uses a remote worker running on Arch Linux (gilbert) via Tailscale VPN.

### Architecture

1. NestJS dispatches jobs to worker at `http://100.91.29.119:5000`
2. Worker runs scrapers in Kitty terminal windows
3. Worker sends results back to NestJS callback endpoint
4. NestJS saves results to database

### Deployment

Run `./scripts/deploy-worker.sh` to deploy latest code and restart service.

### Monitoring

Check worker status:
```bash
ssh gilbert "sudo systemctl status scraper-worker"
```

View worker logs:
```bash
ssh gilbert "sudo journalctl -u scraper-worker -f"
```
```

**Step 2: Create detailed setup documentation**

Create `docs/scraper-worker-setup.md`:
```markdown
# Scraper Worker Setup Guide

## Prerequisites

- Arch Linux machine with GUI (X11)
- Tailscale installed and connected
- Kitty terminal emulator
- Python 3.11+

## Installation

1. Install dependencies:
   ```bash
   sudo pacman -S python python-pip uvicorn python-fastapi kitty-terminfo
   ```

2. Clone repository:
   ```bash
   git clone <repo-url> ~/Development/neon-goals-service
   ```

3. Create systemd service (see systemd file in main docs)

4. Enable and start service
```
---

## Summary

This plan creates a complete distributed scraping architecture:

| Component | Location | Purpose |
|-----------|----------|---------|
| NestJS scraper module | EC2 | Dispatch jobs, receive callbacks |
| FastAPI worker | Gilbert (Arch) | Run scrapers in Kitty |
| Systemd service | Gilbert | Keep worker running |
| Deploy script | Local | Easy deployment |

### Key Design Decisions

1. **Callback pattern**: Worker calls back to NestJS with results (no polling)
2. **Dynamic callback URL**: Uses origin IP so it works from any Tailscale IP
3. **Kitty instance-group**: Multiple scrapers can run simultaneously
4. **Background tasks**: HTTP returns immediately, scraper runs asynchronously
