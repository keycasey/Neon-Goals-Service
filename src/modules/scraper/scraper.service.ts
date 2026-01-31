import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service';
import { GoalType } from '@prisma/client';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin
chromium.use(StealthPlugin());

interface ProductCandidate {
  id: string;
  name: string;
  price: number;
  retailer: string;
  url: string;
  image: string;
  condition?: 'new' | 'used' | 'refurbished';
  rating?: number;
  reviewCount?: number;
  inStock?: boolean;
  estimatedDelivery?: string;
  features?: string[];
  savings?: number;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Queue a scraping job for a goal
   */
  async queueCandidateAcquisition(goalId: string): Promise<void> {
    await this.prisma.scrapeJob.create({
      data: {
        goalId,
        status: 'pending',
      },
    });
    this.logger.log(`Queued scraping job for goal: ${goalId}`);
  }

  /**
   * Background job processor - runs every 2 minutes
   */
  @Cron('*/2 * * * *')
  async processPendingJobs() {
    const jobs = await this.prisma.scrapeJob.findMany({
      where: {
        status: 'pending',
        attempts: { lt: 3 },
      },
      take: 5, // Process 5 at a time
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
        // Mark as running
        await this.prisma.scrapeJob.update({
          where: { id: job.id },
          data: { status: 'running' },
        });

        // Acquire candidates
        const candidates = await this.acquireCandidatesForGoal(job.goal);

        // Update goal with candidates
        await this.prisma.itemGoalData.update({
          where: { goalId: job.goal.id },
          data: {
            candidates: candidates as any,
            statusBadge: 'ready',
            productImage: candidates[0]?.image || job.goal.itemData?.productImage,
            category: job.goal.itemData?.category || 'vehicle',
            searchTerm: job.goal.itemData?.searchTerm || job.goal.title,
          },
        });

        // Mark job as complete
        await this.prisma.scrapeJob.update({
          where: { id: job.id },
          data: { status: 'completed' },
        });

        this.logger.log(
          `✅ Populated ${candidates.length} candidates for goal: ${job.goal.title}`,
        );
      } catch (error) {
        // Mark as failed, increment attempts
        await this.prisma.scrapeJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            attempts: job.attempts + 1,
            error: error.message,
          },
        });
        this.logger.error(`❌ Failed to scrape for job ${job.id}:`, error);
      }
    }
  }

  /**
   * Daily re-scrape all active item goals
   */
  @Cron('0 0 * * *') // Every day at midnight
  async refreshAllActiveCandidates() {
    const activeGoals = await this.prisma.goal.findMany({
      where: {
        type: GoalType.item,
        status: 'active',
      },
    });

    for (const goal of activeGoals) {
      await this.queueCandidateAcquisition(goal.id);
    }

    this.logger.log(
      `✅ Queued ${activeGoals.length} goals for daily re-scraping`,
    );
  }

  /**
   * Main method to acquire candidates for a goal
   */
  async acquireCandidatesForGoal(goal: any): Promise<ProductCandidate[]> {
    this.logger.log(`Acquiring candidates for: ${goal.title}`);

    // Determine search query - use searchTerm for vehicle goals, fallback to title
    const searchQuery = goal.itemData?.category === 'vehicle' && goal.itemData?.searchTerm
      ? goal.itemData.searchTerm
      : goal.title;

    this.logger.log(`Search query: ${searchQuery} (category: ${goal.itemData?.category || 'general'})`);

    // Try to scrape real data, fallback to mock if it fails
    let candidates: ProductCandidate[] = [];

    try {
      candidates = await this.scrapeFromWeb(searchQuery);
      this.logger.log(`✅ Successfully scraped ${candidates.length} candidates`);
    } catch (error) {
      this.logger.warn(`⚠️ Web scraping failed, using mock data: ${error.message}`);
      candidates = this.getMockCandidates(searchQuery);
    }

    // Get denied candidate URLs
    const deniedCandidates = (goal.itemData?.deniedCandidates as any[]) || [];
    const deniedUrls = new Set(deniedCandidates.map((c) => c.url));

    // Filter out denied candidates
    const filteredCandidates = candidates.filter(
      (candidate) => !deniedUrls.has(candidate.url),
    );

    // Deduplicate by URL
    const uniqueCandidates = this.deduplicateByUrl(filteredCandidates);

    this.logger.log(`Filtered out ${deniedUrls.size} denied candidates`);
    this.logger.log(`Returning ${uniqueCandidates.length} unique candidates`);

    return uniqueCandidates;
  }

  /**
   * Scrape candidates from web - tries camoufox first (free), falls back to browser-use ($1.60)
   */
  private async scrapeFromWeb(query: string): Promise<ProductCandidate[]> {
    // Try camoufox first (free, stealth Firefox)
    try {
      this.logger.log(`🦊 Trying camoufox (free) for: ${query}`);
      return await this.scrapeWithCamoufox(query);
    } catch (error) {
      this.logger.warn(`⚠️ Camoufox failed: ${error.message}`);
      this.logger.log(`🤖 Falling back to browser-use (cost: $1.60)`);
      return await this.scrapeWithBrowserUse(query);
    }
  }

  /**
   * Scrape using camoufox (free, stealth Firefox browser)
   * Runs all 5 scrapers in parallel: CarGurus, CarMax, KBB, TrueCar, Carvana
   */
  private async scrapeWithCamoufox(query: string): Promise<ProductCandidate[]> {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      const pythonPath = 'python3';
      const baseDir = '/home/trill/Development/neon-goals-service/scripts';

      // All 5 camoufox scrapers
      const scrapers = [
        { name: 'CarGurus', script: `${baseDir}/scrape-cars-camoufox.py` },
        { name: 'CarMax', script: `${baseDir}/scrape-carmax.py` },
        { name: 'KBB', script: `${baseDir}/scrape-kbb.py` },
        { name: 'TrueCar', script: `${baseDir}/scrape-truecar.py` },
        { name: 'Carvana', script: `${baseDir}/scrape-carvana.py` },
      ];

      this.logger.log(`🦊 Running all 5 camoufox scrapers for: ${query}`);

      // Run all scrapers in parallel
      const results = await Promise.allSettled(
        scrapers.map(async (scraper) => {
          try {
            const { stdout, stderr } = await execPromise(
              `${pythonPath} ${scraper.script} "${query}" 5`,
              { timeout: 120000 }
            );

            if (stderr && !stderr.includes('[') && !stderr.includes('Launching')) {
              this.logger.warn(`${scraper.name} stderr: ${stderr.substring(0, 200)}`);
            }

            const result = JSON.parse(stdout);

            if (result.error) {
              throw new Error(`${scraper.name}: ${result.error}`);
            }

            this.logger.log(`✅ ${scraper.name}: ${result.length} listings`);
            return result;
          } catch (error) {
            this.logger.warn(`⚠️ ${scraper.name} failed: ${error.message}`);
            return [];
          }
        })
      );

      // Combine all successful results
      const allListings = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r: any) => r.value)
        .filter((item: any) => item && item.price > 0);

      this.logger.log(`🦊 Total listings from all sources: ${allListings.length}`);

      // Convert to ProductCandidate format
      const candidates: ProductCandidate[] = allListings.map((item: any, index: number) => {
        const features = [];
        if (item.mileage && item.mileage > 0) {
          features.push(`${item.mileage.toLocaleString()} mi`);
        }

        return {
          id: `${item.retailer?.toLowerCase() || 'scraper'}-${Date.now()}-${index}`,
          name: item.name,
          price: Math.round(item.price),
          retailer: item.retailer || 'Unknown',
          url: item.url,
          image: item.image || this.getRandomTruckImage(),
          condition: 'used',
          rating: 4.5 + Math.random() * 0.5,
          reviewCount: Math.floor(Math.random() * 150) + 50,
          inStock: true,
          estimatedDelivery: item.location || 'Contact seller',
          features: features,
        };
      });

      if (candidates.length === 0) {
        throw new Error('No listings found across all 5 sources');
      }

      this.logger.log(`✅ Returning ${candidates.length} total candidates (FREE)`);
      return candidates;

    } catch (error) {
      this.logger.error(`❌ Multi-site camoufox scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scrape using browser-use (AI agent, costs $1.60 per scrape)
   */
  private async scrapeWithBrowserUse(query: string): Promise<ProductCandidate[]> {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      // Call the Python browser-use script
      const scriptPath = '/home/trill/Development/neon-goals-service/scripts/scrape-cars.py';
      const pythonPath = '/home/trill/Development/browser-use/.venv/bin/python';

      this.logger.log(`🤖 Running browser-use agent...`);

      const { stdout, stderr } = await execPromise(
        `${pythonPath} ${scriptPath} "${query}" 3`,
        { timeout: 120000 } // 2 minute timeout - ChatBrowserUse is fast (68s avg)
      );

      if (stderr) {
        this.logger.warn(`Browser-use stderr: ${stderr}`);
      }

      // Parse the JSON output
      const result = JSON.parse(stdout);

      if (result.error) {
        throw new Error(`Browser-use error: ${result.error}`);
      }

      // Convert browser-use results to ProductCandidate format
      const candidates: ProductCandidate[] = result.map((item: any, index: number) => {
        const features = [];

        // Add mileage as primary feature if available
        if (item.mileage && item.mileage > 0) {
          features.push(`${item.mileage.toLocaleString()} mi`);
        }

        // Add any other features from the scraper
        if (item.features && Array.isArray(item.features)) {
          features.push(...item.features);
        }

        return {
          id: `cargurus-${Date.now()}-${index}`,
          name: item.name,
          price: Math.round(item.price),
          retailer: item.retailer || 'CarGurus',
          url: item.url,
          image: item.image || this.getRandomTruckImage(), // Use real image from scraper
          condition: 'used',
          rating: 4.5 + Math.random() * 0.5,
          reviewCount: Math.floor(Math.random() * 150) + 50,
          inStock: true,
          estimatedDelivery: item.location || 'Contact seller',
          features: features,
        };
      });

      this.logger.log(`✅ Browser-use found ${candidates.length} candidates`);

      if (candidates.length === 0) {
        throw new Error('No listings found. Browser-use agent could not find any results.');
      }

      return candidates;

    } catch (error) {
      this.logger.error(`❌ Browser-use scraping failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scrape AutoTrader listings
   */
  private async scrapeAutoTrader(page: any, query: string): Promise<ProductCandidate[]> {
    const candidates: ProductCandidate[] = [];

    // Build AutoTrader search URL
    const searchUrl = `https://www.autotrader.com/cars-for-sale/all-cars/cars-under-50000/${encodeURIComponent(query.replace(/\s+/g, '-').toLowerCase())}`;

    this.logger.log(`Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);

    // Debug: Check page title and URL
    const pageTitle = await page.title();
    const pageUrl = page.url();
    this.logger.log(`Page loaded: ${pageTitle} at ${pageUrl}`);

    // Wait for listings to load - AutoTrader uses h2 for vehicle titles
    try {
      await page.waitForSelector('h2', { timeout: 10000 });
    } catch (error) {
      this.logger.warn(`No listings found on AutoTrader`);

      // Debug: Take screenshot to see what's on the page
      const screenshotPath = `/tmp/autotrader-error-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      this.logger.warn(`Screenshot saved to: ${screenshotPath}`);

      throw new Error('No listings found on AutoTrader. The page may have loaded incorrectly or there are no results for this search.');
    }

    // Get all listing cards
    const listings = await page.evaluate(() => {
      const results: any[] = [];

      // Find all h2 headings (vehicle titles)
      const headings = Array.from(document.querySelectorAll('h2'));

      headings.forEach((heading, index) => {
        if (index >= 10) return; // Limit to 10

        // Get the container - typically a parent div with listing data
        const container = heading.closest('[data-cmp="inventoryListing"]') ||
                         heading.closest('article') ||
                         heading.parentElement?.parentElement?.parentElement;

        if (!container) return;

        // Find the link (usually the h2 is wrapped in an anchor)
        const link = heading.closest('a') || container.querySelector('a[href*="/cars-for-sale/vehicledetails"]');

        // Get all text from container
        const text = container.textContent || '';

        // Extract price - look for $ followed by numbers
        const priceMatch = text.match(/\$\s*([\d,]+)/);

        // Extract mileage - look for numbers followed by "mi"
        const mileageMatch = text.match(/([\d,]+)\s*mi/);

        // Get image
        const img = container.querySelector('img');

        // Only add if we have minimum required data
        if (heading.textContent && link && priceMatch) {
          results.push({
            title: heading.textContent.trim(),
            price: priceMatch[1], // Get the number part without $
            mileage: mileageMatch ? mileageMatch[0] : null,
            url: link.href,
            image: img?.src || null,
          });
        }
      });

      return results;
    });

    this.logger.log(`Found ${listings.length} AutoTrader listings`);

    if (listings.length === 0) {
      throw new Error('AutoTrader returned no listings. The search may not have found any vehicles matching the criteria.');
    }

    for (let i = 0; i < Math.min(listings.length, 10); i++) {
      try {
        const listing = listings[i];

        if (listing.title && listing.price && listing.url) {
          const priceNum = parseFloat(listing.price.replace(/,/g, '')) || 20000;

          candidates.push({
            id: `autotrader-${Date.now()}-${i}`,
            name: listing.title,
            price: Math.round(priceNum),
            retailer: 'AutoTrader',
            url: listing.url,
            image: listing.image || this.getRandomTruckImage(),
            condition: 'used',
            rating: 4.5 + Math.random() * 0.5,
            reviewCount: Math.floor(Math.random() * 150) + 50,
            inStock: true,
            estimatedDelivery: 'Contact seller',
            features: listing.mileage ? [listing.mileage] : [],
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to parse AutoTrader listing ${i}: ${error.message}`);
      }
    }

    return candidates;
  }


  private getRandomTruckImage(): string {
    const images = [
      'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
      'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800',
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
      'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
    ];
    return images[Math.floor(Math.random() * images.length)];
  }

  private getRandomDelivery(): string {
    const options = [
      'Available now',
      'Same day pickup',
      '2-3 days',
      '5-7 days',
      'Home delivery available',
      'In-store pickup only',
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  private getRandomFeatures(): string[] {
    const allFeatures = [
      '4WD',
      'V6 Engine',
      'Low mileage',
      'Crew Cab',
      'Tow package',
      'Certified',
      'Single owner',
      'Clean title',
      'Leather seats',
      'Navigation',
      'Backup camera',
      'Bluetooth',
    ];

    const count = 3 + Math.floor(Math.random() * 3);
    const shuffled = allFeatures.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Generate mock candidates for testing
   */
  private getMockCandidates(title: string): ProductCandidate[] {
    return [
      {
        id: `mock-${Date.now()}-1`,
        name: `${title} - Option 1`,
        price: 25000 + Math.random() * 10000,
        retailer: 'AutoTrader',
        url: `https://www.autotrader.com/mock-${Date.now()}-1`,
        image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
        condition: 'used',
        rating: 4.5,
        reviewCount: 120,
        inStock: true,
        estimatedDelivery: 'Available now',
        features: ['4WD', 'V6 Engine', 'Low mileage'],
      },
      {
        id: `mock-${Date.now()}-2`,
        name: `${title} - Option 2`,
        price: 27000 + Math.random() * 10000,
        retailer: 'Cars.com',
        url: `https://www.cars.com/mock-${Date.now()}-2`,
        image: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800',
        condition: 'used',
        rating: 4.7,
        reviewCount: 85,
        inStock: true,
        estimatedDelivery: 'Available now',
        features: ['Crew Cab', 'Tow package', 'Certified'],
      },
      {
        id: `mock-${Date.now()}-3`,
        name: `${title} - Option 3`,
        price: 23000 + Math.random() * 10000,
        retailer: 'Carvana',
        url: `https://www.carvana.com/mock-${Date.now()}-3`,
        image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
        condition: 'used',
        rating: 4.3,
        reviewCount: 200,
        inStock: true,
        estimatedDelivery: '7-day delivery',
        features: ['Single owner', 'Clean title', '60k miles'],
      },
    ];
  }

  /**
   * Deduplicate candidates by URL
   */
  private deduplicateByUrl(
    candidates: ProductCandidate[],
  ): ProductCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });
  }
}
