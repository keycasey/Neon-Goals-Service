import { config } from 'dotenv';
import { AiGoalCreationService } from './src/modules/ai/ai-goal-creation.service';
import { OpenAIService } from './src/modules/ai/openai.service';
import { PrismaService } from './src/config/prisma.service';

// Load environment variables
config();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

async function testScenario(name: string, goalType: 'item' | 'finance' | 'action') {
  console.log(`\n${colors.bright}${colors.cyan}========================================`);
  console.log(`TESTING: ${name.toUpperCase()}`);
  console.log(`========================================${colors.reset}\n`);

  const prisma = new PrismaService();
  const configService = { get: (key: string) => process.env[key] || '' } as any;
  const openaiService = new OpenAIService(configService, prisma);
  const aiService = new AiGoalCreationService(configService, prisma, openaiService);
  const userId = 'cmkw6y3is0000ic78n234zw6b'; // Alex Chen

  try {
    // Simulate conversation flow with AI
    const testFlow = getTestFlow(goalType);

    console.log(`${colors.yellow}📝 Test Flow:${colors.reset}`);
    testFlow.forEach((step, i) => {
      console.log(`  ${i + 1}. User: "${step}"`);
    });
    console.log();

    // Start session
    await aiService.startSession(userId);
    await delay(1000);

    // Send the final message that triggers goal creation
    const finalMessage = testFlow[testFlow.length - 1];
    console.log(`${colors.blue}💬 User: "${finalMessage}"${colors.reset}`);

    const response = await aiService.processMessage(userId, finalMessage);

    console.log(`${colors.green}🤖 AI: ${response.content}${colors.reset}`);
    console.log(`${colors.cyan}   Goal Preview: ${response.goalPreview ? '✅ YES' : '❌ NO'}${colors.reset}`);
    console.log(`${colors.cyan}   Awaiting Confirmation: ${response.awaitingConfirmation ? '✅ YES' : '❌ NO'}${colors.reset}`);

    if (response.goalPreview) {
      console.log(`\n${colors.yellow}📄 Goal Preview Markdown:${colors.reset}`);
      console.log('─'.repeat(50));
      console.log(response.goalPreview);
      console.log('─'.repeat(50));
    }

    // If we have a preview, simulate user confirming
    if (response.awaitingConfirmation) {
      console.log(`\n${colors.blue}✅ User clicks "Looks good!"${colors.reset}`);
      await delay(500);

      const confirmResponse = await aiService.confirmGoal(userId);
      console.log(`${colors.green}🤖 AI: ${confirmResponse.content}${colors.reset}`);
      console.log(`${colors.cyan}   Goal Created: ${confirmResponse.goalCreated ? '✅ YES' : '❌ NO'}${colors.reset}`);

      if (confirmResponse.goalCreated && confirmResponse.goal) {
        console.log(`\n${colors.green}🎉 Goal successfully created!${colors.reset}`);
        console.log(`   ID: ${confirmResponse.goal.id}`);
        console.log(`   Title: ${confirmResponse.goal.title}`);
        console.log(`   Type: ${confirmResponse.goal.type}`);

        // Verify in database
        const dbGoal = await prisma.goal.findUnique({
          where: { id: confirmResponse.goal.id },
        });

        if (dbGoal) {
          console.log(`${colors.green}✅ Verified in database${colors.reset}`);

          // Cleanup test goal
          await prisma.goal.delete({ where: { id: confirmResponse.goal.id } });
          console.log(`${colors.yellow}🧹 Cleaned up test goal${colors.reset}`);
        } else {
          console.log(`${colors.magenta}⚠️  WARNING: Goal not found in database!${colors.reset}`);
        }
      }
    }

    // Clear session for next test
    aiService.clearSession(userId);
    await prisma.$disconnect();

    console.log(`\n${colors.green}✅ ${name} test completed successfully!${colors.reset}`);

  } catch (error) {
    console.error(`${colors.magenta}❌ Error during ${name} test:${colors.reset}`, error);
    await prisma.$disconnect();
    throw error;
  }
}

function getTestFlow(goalType: 'item' | 'finance' | 'action'): string[] {
  switch (goalType) {
    case 'item':
      return [
        "I'm thinking about buying a new laptop for gaming",
        "I want an ASUS ROG with good graphics",
        "My budget is around $2000",
        "Let's make this a goal",
      ];

    case 'finance':
      return [
        "I want to build up my savings",
        "I'm saving for a down payment on a house",
        "I need $50,000 total and I have $10,000 saved so far",
        "Can you help me create a goal for this?",
      ];

    case 'action':
      return [
        "I want to learn a new skill this year",
        "I'm interested in learning TypeScript",
        "I want to break it down into manageable steps",
        "Let's create a goal for this",
      ];

    default:
      return [];
  }
}

async function runAllTests() {
  console.log(`\n${colors.bright}${colors.magenta}`);
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   GOAL CREATION FLOW - COMPREHENSIVE TEST   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  const tests = [
    { name: 'Item Goal (Gaming Laptop)', type: 'item' as const },
    { name: 'Finance Goal (House Down Payment)', type: 'finance' as const },
    { name: 'Action Goal (Learn TypeScript)', type: 'action' as const },
  ];

  for (const test of tests) {
    await testScenario(test.name, test.type);
    await delay(2000); // Wait between tests
  }

  console.log(`\n${colors.bright}${colors.green}`);
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         ALL TESTS COMPLETED SUCCESSFULLY!     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);
}

runAllTests().catch(console.error);
