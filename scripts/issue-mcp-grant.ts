import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const [email, daysInput = '30', name = 'Private ChatGPT proof'] = process.argv.slice(2);
  if (!email) {
    throw new Error('Usage: bun run mcp:grant <user-email> [days] [name]');
  }
  const days = Number(daysInput);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('days must be an integer from 1 through 365');
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('User not found');

  const token = `ngmcp_${randomBytes(32).toString('base64url')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const grant = await prisma.mcpPersonalGrant.create({
    data: {
      userId: user.id,
      tokenHash,
      name,
      scopes: ['goals:read', 'goals:write'],
      expiresAt,
    },
  });

  console.log(`Grant ID: ${grant.id}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log(`Bearer token (shown once): ${token}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
