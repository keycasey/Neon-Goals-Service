import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      goal: {
        select: {
          title: true,
        },
      },
    },
  });

  console.log('\n📊 Recent Scrape Jobs:\n');
  jobs.forEach((job) => {
    console.log(`Job #${job.id}: ${job.goal.title}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Attempts: ${job.attempts}`);
    console.log(`  Error: ${job.error || 'None'}`);
    console.log(`  Created: ${job.createdAt}`);
    console.log('');
  });
}

main().finally(() => prisma.$disconnect());
