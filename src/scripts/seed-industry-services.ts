import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log('Connected to database.');

  // 1. Add industry columns
  await client.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS industry VARCHAR(50);');
  await client.query('ALTER TABLE business_types ADD COLUMN IF NOT EXISTS industry VARCHAR(50);');

  // 2. Assign existing CA defaults to 'financial_services'
  await client.query(`UPDATE services SET industry = 'financial_services' WHERE "organizationId" IS NULL AND (industry IS NULL OR industry = '');`);
  await client.query(`UPDATE business_types SET industry = 'financial_services' WHERE "organizationId" IS NULL AND (industry IS NULL OR industry = '');`);

  // 3. Define industry services
  const industryServices: Record<string, string[]> = {
    website_developer: [
      'Website Design & Development',
      'Custom Web Applications',
      'E-commerce Development',
      'Website Maintenance & Support',
      'SEO & Digital Marketing',
      'Domain & Hosting Management',
      'API & Third-party Integrations',
      'UI / UX Design',
    ],
    school: [
      'Tuition & Semester Fees',
      'Examination & Hall Ticket',
      'Transportation & Bus Service',
      'Library & Study Materials',
      'Hostel & Accommodation',
      'Admissions & Enrollment',
      'Sports & Extracurriculars',
    ],
    ecommerce: [
      'Order Fulfillment & Delivery',
      'Express Shipping',
      'Product Replacement & Returns',
      'Customer Care & Warranty',
      'Gift Packaging & Notes',
    ],
    healthcare: [
      'General Consultation',
      'Specialist Clinic (OPD)',
      'Diagnostics & Lab Tests',
      'Preventive Health Checkup',
      'Pharmacy & Medical Supplies',
    ],
    saas: [
      'Starter Subscription',
      'Professional Workspace',
      'Enterprise License',
      'API & Webhook Integrations',
      'Priority Support & SLA',
    ],
    custom: [
      'Core Service',
      'Consulting & Strategy',
      'Annual Support Contract',
      'Custom Project Delivery',
    ],
  };

  const industryBusinessTypes: Record<string, string[]> = {
    website_developer: [
      'Website Client',
      'Maintenance Retainer',
      'E-commerce Store',
      'SaaS Platform',
      'Lead / Prospect',
    ],
    school: [
      'Primary School',
      'High School',
      'Higher Secondary (11th/12th)',
      'Undergraduate (Degree / B.Tech)',
      'Postgraduate (Masters)',
      'Faculty & Staff',
    ],
    ecommerce: [
      'Retail Customer',
      'Wholesale / B2B',
      'VIP Member',
      'Subscriber',
    ],
    healthcare: [
      'Outpatient (OPD)',
      'Inpatient (IPD)',
      'Emergency',
      'Corporate / Insurance Client',
    ],
    saas: [
      'Enterprise Tier',
      'Professional Tier',
      'Starter Tier',
      'Free Trial User',
    ],
    custom: [
      'Standard Client',
      'Enterprise Client',
      'Partner',
    ],
  };

  for (const [ind, svcs] of Object.entries(industryServices)) {
    for (const name of svcs) {
      const exists = await client.query(
        `SELECT 1 FROM services WHERE name = $1 AND industry = $2 AND "organizationId" IS NULL`,
        [name, ind]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO services ("organizationId", name, industry, "createdAt", "updatedAt") VALUES (NULL, $1, $2, NOW(), NOW())`,
          [name, ind]
        );
      }
    }
  }

  for (const [ind, bts] of Object.entries(industryBusinessTypes)) {
    for (const name of bts) {
      const exists = await client.query(
        `SELECT 1 FROM business_types WHERE name = $1 AND industry = $2 AND "organizationId" IS NULL`,
        [name, ind]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO business_types ("organizationId", name, industry, "createdAt", "updatedAt") VALUES (NULL, $1, $2, NOW(), NOW())`,
          [name, ind]
        );
      }
    }
  }

  const sCount = await client.query(`SELECT industry, count(*) as count FROM services GROUP BY industry ORDER BY industry`);
  console.log('Services by industry:', sCount.rows);

  const bCount = await client.query(`SELECT industry, count(*) as count FROM business_types GROUP BY industry ORDER BY industry`);
  console.log('Business types by industry:', bCount.rows);

  await client.end();
  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
