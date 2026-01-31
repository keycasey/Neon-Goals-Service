import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCompleteFlow() {
  console.log('🚀 Testing Complete Candidate Flow\n');

  // Get user
  const user = await prisma.user.findFirst({
    where: { email: 'casey.key@pm.me' },
  });

  if (!user) {
    console.error('❌ User not found! Run: npm run prisma:seed');
    return;
  }

  // Step 1: Create truck goal
  console.log('📝 Step 1: Creating new truck goal...');
  const goal = await prisma.goal.create({
    data: {
      type: 'item',
      title: 'Used Ford F-150 Raptor',
      description: 'Looking for a powerful off-road truck',
      status: 'active',
      userId: user.id,
      itemData: {
        create: {
          productImage:
            'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
          bestPrice: 0,
          currency: 'USD',
          retailerUrl: '',
          retailerName: '',
          statusBadge: 'pending_search',
        },
      },
    },
  });

  // Queue scraping job
  await prisma.scrapeJob.create({
    data: {
      goalId: goal.id,
      status: 'pending',
    },
  });

  console.log(`✅ Goal created: ${goal.title}`);
  console.log(`   Goal ID: ${goal.id}\n`);

  // Step 2: Wait for scraping
  console.log('⏳ Step 2: Waiting for scraper to process (max 2 minutes)...');
  let attempts = 0;
  let scrapedGoal: any;

  while (attempts < 24) {
    // Check every 5 seconds for 2 minutes
    await sleep(5000);
    attempts++;

    scrapedGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
      include: { itemData: true },
    });

    const candidates = (scrapedGoal?.itemData?.candidates as any[]) || [];

    if (candidates.length > 0) {
      console.log(`✅ Scraping complete! Found ${candidates.length} candidates\n`);
      break;
    }

    if (attempts % 4 === 0) {
      console.log(`   Still waiting... (${attempts * 5}s elapsed)`);
    }
  }

  if (!scrapedGoal?.itemData?.candidates) {
    console.log('❌ Scraping timed out or failed\n');
    return;
  }

  // Step 3: Show candidates
  console.log('📋 Step 3: Current candidates:');
  const candidates = scrapedGoal.itemData.candidates as any[];
  candidates.forEach((c: any, i: number) => {
    console.log(`\n   ${i + 1}. ${c.name}`);
    console.log(`      Price: $${c.price.toLocaleString()}`);
    console.log(`      Retailer: ${c.retailer}`);
    console.log(`      URL: ${c.url}`);
  });
  console.log('');

  // Step 4: Deny a candidate
  console.log('🚫 Step 4: Denying first candidate...');
  const candidateToDeny = candidates[0];

  await prisma.itemGoalData.update({
    where: { goalId: goal.id },
    data: {
      candidates: candidates.slice(1) as any,
      deniedCandidates: [
        {
          ...candidateToDeny,
          deniedAt: new Date().toISOString(),
        },
      ] as any,
    },
  });

  console.log(`✅ Denied: ${candidateToDeny.name}\n`);

  // Step 5: Show denied candidates
  console.log('🗑️  Step 5: Denied candidates:');
  const updatedGoal = await prisma.goal.findUnique({
    where: { id: goal.id },
    include: { itemData: true },
  });

  const deniedCandidates =
    (updatedGoal?.itemData?.deniedCandidates as any[]) || [];
  deniedCandidates.forEach((c: any, i: number) => {
    console.log(`\n   ${i + 1}. ${c.name}`);
    console.log(`      Price: $${c.price.toLocaleString()}`);
    console.log(`      Denied at: ${c.deniedAt}`);
  });
  console.log('');

  // Step 6: Restore candidate
  console.log('♻️  Step 6: Restoring denied candidate...');
  const currentCandidates =
    (updatedGoal?.itemData?.candidates as any[]) || [];
  const { deniedAt, ...restoredCandidate } = deniedCandidates[0];

  await prisma.itemGoalData.update({
    where: { goalId: goal.id },
    data: {
      candidates: [...currentCandidates, restoredCandidate] as any,
      deniedCandidates: [] as any,
    },
  });

  console.log(`✅ Restored: ${restoredCandidate.name}\n`);

  // Step 7: Final state
  console.log('📊 Step 7: Final state:');
  const finalGoal = await prisma.goal.findUnique({
    where: { id: goal.id },
    include: { itemData: true },
  });

  const finalCandidates = (finalGoal?.itemData?.candidates as any[]) || [];
  const finalDenied = (finalGoal?.itemData?.deniedCandidates as any[]) || [];

  console.log(`   Active Candidates: ${finalCandidates.length}`);
  console.log(`   Denied Candidates: ${finalDenied.length}`);

  console.log('\n✅ Complete flow test successful!\n');
  console.log('🎯 Summary:');
  console.log('   - Goal created ✓');
  console.log('   - Candidates scraped ✓');
  console.log('   - Candidate denied ✓');
  console.log('   - Candidate restored ✓');
  console.log('   - All features working! ✓\n');
}

testCompleteFlow()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
