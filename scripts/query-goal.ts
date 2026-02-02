import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const goal = await prisma.goal.findUnique({
    where: { id: 'cml2td4zj0003icmenchseysx' },
    include: { itemData: true }
  });
  console.log(JSON.stringify(goal, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
