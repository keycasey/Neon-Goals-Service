import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFinalRealScraping() {
  console.log('🌐 Testing REAL Web Scraping with Fixed Headers\n');

  const user = await prisma.user.findFirst({
    where: { email: 'casey.key@pm.me' },
  });

  if (!user) {
    console.error('❌ User not found');
    return;
  }

  // Create a new goal
  console.log('📝 Creating goal: "2020 Honda Civic"...');
  const goal = await prisma.goal.create({
    data: {
      type: 'item',
      title: '2020 Honda Civic',
      description: 'Looking for a reliable sedan',
      status: 'active',
      userId: user.id,
      itemData: {
        create: {
          productImage: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800',
          bestPrice: 0,
          currency: 'USD',
          retailerUrl: '',
          retailerName: '',
          statusBadge: 'pending_search',
        },
      },
    },
  });

  await prisma.scrapeJob.create({
    data: {
      goalId: goal.id,
      status: 'pending',
    },
  });

  console.log(`✅ Goal created: ${goal.id}\n`);
  console.log('⏳ Waiting for REAL web scraping (max 2 minutes)...\n');

  let attempts = 0;
  while (attempts < 24) {
    await sleep(5000);
    attempts++;

    const updatedGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
      include: { itemData: true },
    });

    const candidates = (updatedGoal?.itemData?.candidates as any[]) || [];

    if (candidates.length > 0) {
      console.log(`\n✅ Real scraping complete! Found ${candidates.length} candidates:\n`);

      candidates.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name}`);
        console.log(`   Price: $${c.price.toLocaleString()}`);
        console.log(`   Retailer: ${c.retailer}`);
        console.log(`   URL: ${c.url}`);
        console.log(`   Features: ${c.features?.join(', ') || 'N/A'}`);
        console.log('');
      });

      // Check if these are real or mock
      const isReal = !candidates[0].url.includes('mock') &&
                     (candidates[0].url.includes('http://') || candidates[0].url.includes('https://'));

      if (isReal) {
        console.log('🎉 SUCCESS! These are REAL scraped results from the web!\n');
      } else {
        console.log('ℹ️  Note: These appear to be mock results (web scraping may have failed)\n');
      }

      break;
    }

    if (attempts % 4 === 0) {
      console.log(`   Still scraping... (${attempts * 5}s elapsed)`);
    }
  }

  if (attempts >= 24) {
    console.log('\n⚠️  Scraping timed out\n');

    // Check scrape job for errors
    const job = await prisma.scrapeJob.findFirst({
      where: { goalId: goal.id },
      orderBy: { createdAt: 'desc' },
    });

    if (job?.error) {
      console.log(`❌ Scrape job error: ${job.error}\n`);
    }
  }
}

testFinalRealScraping()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
