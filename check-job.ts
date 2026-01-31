import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJob() {
  const job = await prisma.scrapeJob.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      goal: {
        include: {
          itemData: true,
        },
      },
    },
  });

  if (!job) {
    console.log('No jobs found');
    return;
  }

  console.log('\n📊 Latest Scrape Job:');
  console.log('Job ID:', job.id);
  console.log('Status:', job.status);
  console.log('Attempts:', job.attempts);
  console.log('Error:', job.error || 'None');
  console.log('\n🎯 Goal:', job.goal.title);

  if (job.goal.itemData?.candidates) {
    const candidates = job.goal.itemData.candidates as any[];
    console.log('\n✅ Candidates Found:', candidates.length);
    candidates.forEach((c, i) => {
      console.log(`\n  ${i + 1}. ${c.name}`);
      console.log(`     Price: $${c.price.toFixed(2)}`);
      console.log(`     Retailer: ${c.retailer}`);
      console.log(`     URL: ${c.url}`);
    });
  } else {
    console.log('\n⏳ No candidates yet (job may still be pending)');
  }
}

checkJob()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
