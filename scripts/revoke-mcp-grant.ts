import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [grantId] = process.argv.slice(2);
  if (!grantId) throw new Error('Usage: bun run mcp:revoke <grant-id>');
  const result = await prisma.mcpPersonalGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) throw new Error('Active grant not found');
  console.log(`Revoked grant ${grantId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
