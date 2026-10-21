import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    const result = await prisma.plaidAccount.updateMany({
      where: {
        OR: [
          { legacyAccessToken: { not: null } },
          { legacyItemId: { not: null } },
        ],
      },
      data: {
        legacyAccessToken: null,
        legacyItemId: null,
      },
    });
    console.log(
      `Cleared legacy Plaid credentials from ${result.count} account row(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Failed to clear legacy Plaid credentials', error);
  process.exitCode = 1;
});
