import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the three plans that were hard-coded on the marketing site.
const DEFAULT_PLANS = [
  {
    name: 'Basic',
    price: '₹499',
    badge: 'Most Popular',
    trialText: '7-day Free Trial',
    description: 'Perfect for individual CAs and small firms getting started.',
    buttonText: 'Start Free Trial',
    buttonLink: '/signup',
    isHighlighted: true,
    features: [
      'Client Onboarding System',
      'Bulk Email Scheduler',
      '5 Custom Email Templates',
      'Pre-built Templates Library',
      'Organization Login',
      'Client Document Submission',
      'Basic Dashboard',
    ],
  },
  {
    name: 'Pro',
    price: '₹699',
    badge: 'Coming Soon',
    trialText: null,
    description:
      'For growing firms that need advanced automation and analytics.',
    buttonText: 'Join Waitlist',
    buttonLink: '/#contact',
    isHighlighted: false,
    features: [
      'Everything in Basic, plus:',
      'Unlimited Custom Templates',
      'Advanced Email Analytics',
      'Priority Email Delivery',
      'Client Portal Login',
      'Team Collaboration',
      'API Access',
    ],
  },
  {
    name: 'Premium',
    price: '₹999',
    badge: 'Coming Soon',
    trialText: null,
    description: 'Enterprise-grade features for large organizations.',
    buttonText: 'Join Waitlist',
    buttonLink: '/#contact',
    isHighlighted: false,
    features: [
      'Everything in Pro, plus:',
      'White-label Branding',
      'Dedicated Account Manager',
      'Custom Integrations',
      'SLA Guarantee',
      'Advanced Security',
      'Unlimited Users',
    ],
  },
];

export class CreatePricingPlans1792340000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pricing_plans" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(60) NOT NULL,
        "price" varchar(30) NOT NULL,
        "period" varchar(30) NOT NULL DEFAULT '/month',
        "description" text NOT NULL DEFAULT '',
        "badge" varchar(40),
        "trialText" varchar(60),
        "buttonText" varchar(40) NOT NULL,
        "buttonLink" varchar(255) NOT NULL,
        "features" jsonb NOT NULL DEFAULT '[]',
        "isHighlighted" boolean NOT NULL DEFAULT false,
        "sortOrder" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM "pricing_plans"`,
    )) as { count: number }[];
    if (count > 0) return;

    for (const [i, p] of DEFAULT_PLANS.entries()) {
      await queryRunner.query(
        `INSERT INTO "pricing_plans"
          ("name", "price", "badge", "trialText", "description", "buttonText", "buttonLink", "features", "isHighlighted", "sortOrder")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          p.name,
          p.price,
          p.badge,
          p.trialText,
          p.description,
          p.buttonText,
          p.buttonLink,
          JSON.stringify(p.features),
          p.isHighlighted,
          i + 1,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pricing_plans"`);
  }
}
