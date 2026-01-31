import { PrismaClient, GoalType, GoalStatus, ItemStatusBadge } from '@prisma/client';

const prisma = new PrismaClient();

async function seedUserGoals(userId: string, userName: string) {
  // Mock product search results
  const mockProductSearchResults = [
    {
      id: '1',
      name: 'Sony WH-1000XM5 - Premium Wireless Noise Canceling Headphones',
      price: 328.00,
      retailer: 'Amazon',
      url: 'https://amazon.com/dp/B0C4HYX144',
      image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    },
    {
      id: '2',
      name: 'Sony WH-1000XM5 - Black',
      price: 349.99,
      retailer: 'Best Buy',
      url: 'https://bestbuy.com/site/sony-wh-1000xm5',
      image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    },
    {
      id: '3',
      name: 'Sony WH-1000XM5 - Silver',
      price: 315.00,
      retailer: 'Walmart',
      url: 'https://walmart.com/ip/sony-wh-1000xm5',
      image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    },
    {
      id: '4',
      name: 'Sony WH-1000XM5 - International Import',
      price: 299.00,
      retailer: 'eBay',
      url: 'https://ebay.com/itm/sony-wh-1000xm5',
      image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
    },
  ];

  // Create Item Goals
  const itemGoals = await Promise.all([
    prisma.goal.create({
      data: {
        type: GoalType.item,
        title: 'Sony WH-1000XM5 Headphones',
        description: 'Premium noise-canceling wireless headphones for work and travel',
        status: GoalStatus.active,
        userId,
        itemData: {
          create: {
            productImage: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400',
            bestPrice: 299.00,
            currency: 'USD',
            retailerUrl: 'https://amazon.com/dp/B0C4HYX144',
            retailerName: 'Amazon',
            statusBadge: ItemStatusBadge.price_drop,
            searchResults: mockProductSearchResults,
            candidates: [
              {
                id: 'sony-1',
                name: 'Sony WH-1000XM5 - Black',
                price: 299.00,
                retailer: 'Amazon',
                url: 'https://amazon.com/dp/B0C4HYX144',
                image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=800',
                condition: 'new',
                rating: 4.8,
                reviewCount: 12543,
                savings: 49,
                inStock: true,
                estimatedDelivery: '2-3 days',
                features: ['30-hour battery', 'Multipoint connection', 'Speak-to-Chat'],
              },
              {
                id: 'sony-2',
                name: 'Sony WH-1000XM5 - Midnight Blue',
                price: 328.00,
                retailer: 'Best Buy',
                url: 'https://bestbuy.com/site/sony-wh-1000xm5',
                image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
                condition: 'new',
                rating: 4.7,
                reviewCount: 8921,
                savings: 20,
                inStock: true,
                estimatedDelivery: 'Same day pickup',
                features: ['Premium color', 'Best Buy warranty', 'Price match guarantee'],
              },
              {
                id: 'sony-3',
                name: 'Sony WH-1000XM5 - Silver',
                price: 274.99,
                retailer: 'eBay',
                url: 'https://ebay.com/itm/sony-wh-1000xm5',
                image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800',
                condition: 'refurbished',
                rating: 4.5,
                reviewCount: 342,
                savings: 73,
                inStock: true,
                estimatedDelivery: '5-7 days',
                features: ['Certified refurbished', '90-day warranty', 'Free returns'],
              },
            ],
            selectedCandidateId: null,
            stackId: null,
            stackOrder: null,
          },
        },
        subgoals: {
          create: [
            {
              type: GoalType.finance,
              title: 'Save for Sony Headphones',
              description: 'Set aside $100/month for 3 months',
              status: GoalStatus.active,
              userId,
              financeData: {
                create: {
                  institutionIcon: '🎧',
                  accountName: 'Headphones Fund',
                  currentBalance: 150.00,
                  targetBalance: 299.00,
                  currency: 'USD',
                  progressHistory: [50, 100, 150],
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Research Best Deals',
              description: 'Compare prices across retailers and wait for sales',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 40,
                  tasks: {
                    create: [
                      { title: 'Check Amazon daily deals', completed: true },
                      { title: 'Set up price alerts on CamelCamelCamel', completed: true },
                      { title: 'Compare Best Buy and Walmart prices', completed: false },
                      { title: 'Wait for Black Friday/Prime Day', completed: false },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.item,
        title: 'MacBook Pro 16" M3 Max',
        description: 'Ultimate powerhouse for creative work and development',
        status: GoalStatus.active,
        userId,
        itemData: {
          create: {
            productImage: 'https://images.unsplash.com/photo-1517336714731-489679fd1ca8?w=400',
            bestPrice: 2499.00,
            currency: 'USD',
            retailerUrl: 'https://apple.com/macbook-pro',
            retailerName: 'Apple',
            statusBadge: ItemStatusBadge.in_stock,
          },
        },
        subgoals: {
          create: [
            {
              type: GoalType.finance,
              title: 'MacBook Pro Savings Fund',
              description: 'Save $500 per month to afford MacBook Pro',
              status: GoalStatus.active,
              userId,
              financeData: {
                create: {
                  institutionIcon: '💻',
                  accountName: 'Tech Upgrade Fund',
                  currentBalance: 1200.00,
                  targetBalance: 2499.00,
                  currency: 'USD',
                  progressHistory: [500, 800, 1000, 1200],
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Freelance for Extra Income',
              description: 'Take on side projects to accelerate savings',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 25,
                  tasks: {
                    create: [
                      { title: 'Update portfolio website', completed: true },
                      { title: 'Apply to 10 freelance gigs', completed: false },
                      { title: 'Complete first paid project', completed: false },
                      { title: 'Earn $1,300 from freelancing', completed: false },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.item,
        title: 'Herman Miller Aeron Chair',
        description: 'Ergonomic office chair for long work sessions',
        status: GoalStatus.active,
        userId,
        itemData: {
          create: {
            productImage: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=400',
            bestPrice: 895.00,
            currency: 'USD',
            retailerUrl: 'https://amazon.com/herman-miller-aeron',
            retailerName: 'Amazon',
            statusBadge: ItemStatusBadge.pending_search,
          },
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.item,
        title: 'DJI Mini 4 Pro Drone',
        description: 'Compact drone for aerial photography and videography',
        status: GoalStatus.active,
        userId,
        itemData: {
          create: {
            productImage: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400',
            bestPrice: 759.00,
            currency: 'USD',
            retailerUrl: 'https://djistore.com/mini-4-pro',
            retailerName: 'DJI Store',
            statusBadge: ItemStatusBadge.in_stock,
          },
        },
      },
    }),
  ]);

  // Create Finance Goals
  const financeGoals = await Promise.all([
    prisma.goal.create({
      data: {
        type: GoalType.finance,
        title: 'Emergency Fund',
        description: '6 months of expenses for financial security',
        status: GoalStatus.active,
        userId,
        financeData: {
          create: {
            institutionIcon: '🏦',
            accountName: 'Chase Savings',
            currentBalance: 18500.00,
            targetBalance: 30000.00,
            currency: 'USD',
            progressHistory: [5000, 7500, 10000, 12000, 14000, 16000, 17500, 18500],
          },
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.finance,
        title: 'Down Payment on House',
        description: 'Save $100,000 for a down payment on first home',
        status: GoalStatus.active,
        userId,
        financeData: {
          create: {
            institutionIcon: '🏠',
            accountName: 'Ally High-Yield Savings',
            currentBalance: 45250.00,
            targetBalance: 100000.00,
            currency: 'USD',
            progressHistory: [10000, 15000, 20000, 25000, 30000, 35000, 40000, 45250],
          },
        },
        subgoals: {
          create: [
            {
              type: GoalType.finance,
              title: 'Reach $60k Milestone',
              description: 'First major milestone - 60% of the way there',
              status: GoalStatus.active,
              userId,
              financeData: {
                create: {
                  institutionIcon: '🎯',
                  accountName: 'Ally High-Yield Savings',
                  currentBalance: 45250.00,
                  targetBalance: 60000.00,
                  currency: 'USD',
                  progressHistory: [40000, 42000, 43500, 45250],
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Reduce Monthly Expenses',
              description: 'Cut unnecessary spending to save $800/month more',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 50,
                  tasks: {
                    create: [
                      { title: 'Cancel unused subscriptions', completed: true },
                      { title: 'Meal prep instead of eating out', completed: true },
                      { title: 'Negotiate lower insurance rates', completed: true },
                      { title: 'Switch to cheaper phone plan', completed: false },
                      { title: 'Carpool or use public transit', completed: false },
                    ],
                  },
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Increase Income Streams',
              description: 'Add side income to accelerate savings',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 30,
                  tasks: {
                    create: [
                      { title: 'Research side hustle opportunities', completed: true },
                      { title: 'Start freelance consulting', completed: true },
                      { title: 'Launch online course', completed: false },
                      { title: 'Rent out spare room on Airbnb', completed: false },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.finance,
        title: 'Investment Portfolio',
        description: 'Build a diversified stock portfolio for long-term growth',
        status: GoalStatus.active,
        userId,
        financeData: {
          create: {
            institutionIcon: '📈',
            accountName: 'Fidelity IRA',
            currentBalance: 28750.00,
            targetBalance: 50000.00,
            currency: 'USD',
            progressHistory: [5000, 8000, 12000, 15000, 18000, 21000, 25000, 28750],
          },
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.finance,
        title: 'Travel Fund - Japan Trip',
        description: 'Save up for an amazing 2-week trip to Japan',
        status: GoalStatus.active,
        userId,
        financeData: {
          create: {
            institutionIcon: '✈️',
            accountName: 'Capital One 360',
            currentBalance: 4200.00,
            targetBalance: 8000.00,
            currency: 'USD',
            progressHistory: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4200],
          },
        },
      },
    }),
  ]);

  // Create Action Goals
  const actionGoals = await Promise.all([
    prisma.goal.create({
      data: {
        type: GoalType.action,
        title: 'Learn Japanese',
        description: 'Reach conversational fluency in Japanese (N3 level)',
        status: GoalStatus.active,
        userId,
        actionData: {
          create: {
            completionPercentage: 35,
            tasks: {
              create: [
                { title: 'Master Hiragana and Katakana', completed: true },
                { title: 'Complete Genki I textbook', completed: true },
                { title: 'Learn 500 kanji characters', completed: false },
                { title: 'Practice daily conversation with language partner', completed: false },
                { title: 'Watch Japanese media without subtitles', completed: false },
              ],
            },
          },
        },
        subgoals: {
          create: [
            {
              type: GoalType.action,
              title: 'Master Kanji Recognition',
              description: 'Learn to read and write 500 essential kanji',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 40,
                  tasks: {
                    create: [
                      { title: 'Complete WaniKani levels 1-10', completed: true },
                      { title: 'Practice writing kanji daily', completed: true },
                      { title: 'Reach WaniKani level 20', completed: false },
                      { title: 'Read simple manga without dictionary', completed: false },
                    ],
                  },
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Conversational Speaking Practice',
              description: 'Build confidence in speaking through regular practice',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 30,
                  tasks: {
                    create: [
                      { title: 'Find language exchange partner on HelloTalk', completed: true },
                      { title: 'Complete 10 iTalki lessons', completed: false },
                      { title: 'Have 30-minute conversation in Japanese', completed: false },
                      { title: 'Join local Japanese conversation meetup', completed: false },
                    ],
                  },
                },
              },
            },
            {
              type: GoalType.action,
              title: 'Listening Comprehension',
              description: 'Understand native Japanese speakers at natural speed',
              status: GoalStatus.active,
              userId,
              actionData: {
                create: {
                  completionPercentage: 25,
                  tasks: {
                    create: [
                      { title: 'Watch anime with Japanese subtitles', completed: true },
                      { title: 'Listen to Japanese podcasts daily', completed: false },
                      { title: 'Watch news in Japanese', completed: false },
                      { title: 'Understand 80% of anime without subtitles', completed: false },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.action,
        title: 'Build Morning Exercise Routine',
        description: 'Establish a consistent 30-minute morning workout habit',
        status: GoalStatus.active,
        userId,
        actionData: {
          create: {
            completionPercentage: 60,
            tasks: {
              create: [
                { title: 'Wake up at 6am daily for 30 days', completed: true },
                { title: 'Create workout playlist', completed: true },
                { title: 'Week 1-2: Light stretching and yoga', completed: true },
                { title: 'Week 3-4: Add bodyweight exercises', completed: true },
                { title: 'Week 5-6: Incorporate resistance training', completed: false },
                { title: 'Week 7-8: Full HIIT workouts', completed: false },
              ],
            },
          },
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.action,
        title: 'Read 24 Books This Year',
        description: 'Read 2 books per month to foster learning and growth',
        status: GoalStatus.active,
        userId,
        actionData: {
          create: {
            completionPercentage: 50,
            tasks: {
              create: [
                { title: 'Create reading list of 24 books', completed: true },
                { title: 'Set up reading nook at home', completed: true },
                { title: 'January: Atomic Habits', completed: true },
                { title: 'January: Deep Work', completed: true },
                { title: 'February: The Psychology of Money', completed: true },
                { title: 'February: Thinking, Fast and Slow', completed: true },
                { title: 'March: The Lean Startup', completed: true },
                { title: 'March: Zero to One', completed: true },
                { title: 'April: Good Strategy Bad Strategy', completed: true },
                { title: 'April: The Mom Test', completed: true },
                { title: 'May: Start with Why', completed: false },
                { title: 'May: Built to Last', completed: false },
              ],
            },
          },
        },
      },
    }),
    prisma.goal.create({
      data: {
        type: GoalType.action,
        title: 'Launch Side Project',
        description: 'Build and launch a SaaS product to generate passive income',
        status: GoalStatus.active,
        userId,
        actionData: {
          create: {
            completionPercentage: 20,
            tasks: {
              create: [
                { title: 'Brainstorm product ideas', completed: true },
                { title: 'Validate idea with potential users', completed: true },
                { title: 'Create MVP roadmap', completed: false },
                { title: 'Build landing page', completed: false },
                { title: 'Develop core features', completed: false },
                { title: 'Beta testing with early users', completed: false },
                { title: 'Launch on Product Hunt', completed: false },
                { title: 'Get first 10 paying customers', completed: false },
              ],
            },
          },
        },
      },
    }),
  ]);

  return {
    itemCount: itemGoals.length,
    financeCount: financeGoals.length,
    actionCount: actionGoals.length,
  };
}

async function main() {
  console.log('🌱 Starting seed...');

  // Find or create Casey Key's user account
  let user = await prisma.user.findFirst({
    where: {
      email: 'casey.key@pm.me',
    },
  });

  if (!user) {
    console.log('👤 Creating test user: Casey Key...');
    user = await prisma.user.create({
      data: {
        name: 'Casey Key',
        email: 'casey.key@pm.me',
        githubId: 'test_github_id',
        githubLogin: 'caseykey',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=casey',
        settings: {
          create: {
            theme: 'miami-vice',
            chatModel: 'gpt-4',
            displayName: 'Casey',
          },
        },
      },
    });
    console.log(`✅ Created user: ${user.name} (${user.email})`);
  } else {
    console.log(`👤 Found user: ${user.name} (${user.email})`);
  }

  // Seed goals for this user (if not already seeded)
  const existingGoals = await prisma.goal.count({
    where: { userId: user.id },
  });

  if (existingGoals === 0) {
    const result = await seedUserGoals(user.id, user.name);
    const userTotal = result.itemCount + result.financeCount + result.actionCount;

    console.log(`✅ Created ${userTotal} goals for ${user.name}`);
    console.log(`   - ${result.itemCount} item goals`);
    console.log(`   - ${result.financeCount} finance goals`);
    console.log(`   - ${result.actionCount} action goals`);
    console.log(`\n🎉 Seed complete! Seeded Casey Key with ${userTotal} total goals.`);
  } else {
    console.log(`📊 User already has ${existingGoals} goals. Skipping goal seed.`);
  }

  // Create or update test user with email/password authentication
  // Credentials are loaded from environment variables for security
  const testUserEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
  const testUserPassword = process.env.TEST_USER_PASSWORD || 'Test@1234';
  const testUserName = process.env.TEST_USER_NAME || 'Test User';

  let testUser = await prisma.user.findFirst({
    where: { email: testUserEmail },
  });

  if (!testUser) {
    console.log('\n👤 Creating test user with email/password...');
    // Import bcrypt for password hashing
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(testUserPassword, 10);

    testUser = await prisma.user.create({
      data: {
        name: testUserName,
        email: testUserEmail,
        passwordHash,
        emailVerified: new Date(), // Pre-verified for testing
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
        settings: {
          create: {
            theme: 'miami-vice',
            chatModel: 'gpt-4',
            displayName: testUserName,
          },
        },
      },
    });
    console.log(`✅ Created test user: ${testUser.name} (${testUser.email})`);
    console.log(`   Password: ${testUserPassword}`);
  } else {
    console.log(`\n👤 Test user already exists: ${testUser.name} (${testUser.email})`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
