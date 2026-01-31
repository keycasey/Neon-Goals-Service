import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTruckGoal() {
  // Get the test user (Casey Key from seed)
  const user = await prisma.user.findFirst({
    where: { email: 'casey.key@pm.me' },
  });

  if (!user) {
    console.error('User not found! Run: npm run prisma:seed');
    return;
  }

  console.log('Creating truck goal for user:', user.name);

  // Create a used truck goal
  const goal = await prisma.goal.create({
    data: {
      type: 'item',
      title: 'Used Toyota Tacoma TRD Pro',
      description: 'Looking for a reliable used truck under $35k',
      status: 'active',
      userId: user.id,
      itemData: {
        create: {
          productImage: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
          bestPrice: 0,
          currency: 'USD',
          retailerUrl: '',
          retailerName: '',
          statusBadge: 'pending_search',
        },
      },
    },
    include: {
      itemData: true,
    },
  });

  // Queue scraping job
  const job = await prisma.scrapeJob.create({
    data: {
      goalId: goal.id,
      status: 'pending',
    },
  });

  console.log('\n✅ Truck goal created!');
  console.log('Goal ID:', goal.id);
  console.log('Title:', goal.title);
  console.log('Scrape Job ID:', job.id);
  console.log('\n📋 The background scraper will process this in the next 2 minutes...');
  console.log('Or manually check job status:\n');
  console.log('SELECT * FROM "ScrapeJob" WHERE "goalId" = \'' + goal.id + '\';');
}

createTruckGoal()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
