import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWorkspaceFeatures1792250000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('workspace_features');
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'workspace_features',
          columns: [
            {
              name: 'id',
              type: 'serial',
              isPrimary: true,
            },
            {
              name: 'key',
              type: 'varchar',
              length: '60',
              isUnique: true,
            },
            {
              name: 'name',
              type: 'varchar',
              length: '100',
            },
            {
              name: 'badge',
              type: 'varchar',
              length: '60',
              default: "''",
            },
            {
              name: 'description',
              type: 'text',
              default: "''",
            },
            {
              name: 'icon',
              type: 'varchar',
              length: '50',
              default: "'Sparkles'",
            },
            {
              name: 'gradient',
              type: 'varchar',
              length: '100',
              default: "'from-orange-500 to-amber-500'",
            },
            {
              name: 'colSpan',
              type: 'varchar',
              length: '50',
              isNullable: true,
            },
            {
              name: 'priority',
              type: 'int',
              default: 1,
            },
            {
              name: 'isLocked',
              type: 'boolean',
              default: false,
            },
            {
              name: 'lockReason',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'isActive',
              type: 'boolean',
              default: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'workspace_features',
        new TableIndex({
          name: 'IDX_workspace_features_priority',
          columnNames: ['priority'],
        }),
      );

      // Seed default industry presets with priorities
      const defaults = [
        {
          key: 'website_developer',
          name: 'Websites & Developers',
          badge: 'API & Webhooks',
          description: 'Embeddable contact forms, CORS domain whitelist & transactional email API.',
          icon: 'Globe',
          gradient: 'from-orange-500 to-amber-500',
          colSpan: null,
          priority: 1,
          isLocked: false,
        },
        {
          key: 'school',
          name: 'Educational Institutes',
          badge: 'Campuses & Unis',
          description: 'Student notices, fee alerts & internal circulars for faculty, lecturers & HODs.',
          icon: 'GraduationCap',
          gradient: 'from-blue-500 to-indigo-600',
          colSpan: null,
          priority: 2,
          isLocked: false,
        },
        {
          key: 'ecommerce',
          name: 'E-Commerce & Retail',
          badge: 'High Conversion',
          description: 'Order confirmations, shipment tracking updates & abandoned cart email drips.',
          icon: 'ShoppingCart',
          gradient: 'from-amber-500 to-orange-600',
          colSpan: null,
          priority: 3,
          isLocked: false,
        },
        {
          key: 'healthcare',
          name: 'Healthcare & Clinics',
          badge: 'HIPAA-Friendly',
          description: 'Patient appointment reminders, lab reports & doctor follow-up communications.',
          icon: 'HeartPulse',
          gradient: 'from-rose-500 to-pink-600',
          colSpan: null,
          priority: 4,
          isLocked: false,
        },
        {
          key: 'saas',
          name: 'SaaS & Tech Startups',
          badge: 'Developer First',
          description: 'Product onboarding drips, magic login alerts & automated subscription notices.',
          icon: 'Rocket',
          gradient: 'from-violet-500 to-purple-600',
          colSpan: null,
          priority: 5,
          isLocked: false,
        },
        {
          key: 'financial_services',
          name: 'CA & Financial Firms',
          badge: 'Compliance Ready',
          description: 'TDS challans, tax filing deadlines, GST reconciliation & document collection.',
          icon: 'Calculator',
          gradient: 'from-teal-500 to-emerald-600',
          colSpan: null,
          priority: 6,
          isLocked: false,
        },
        {
          key: 'custom',
          name: 'Universal Business',
          badge: 'All Industries',
          description: 'Full-suite email automations, contact book management, scheduled broadcasts & custom templates for any enterprise.',
          icon: 'Mail',
          gradient: 'from-slate-700 to-slate-900',
          colSpan: 'lg:col-span-2',
          priority: 7,
          isLocked: false,
        },
      ];

      for (const item of defaults) {
        await queryRunner.query(
          `INSERT INTO "workspace_features" ("key", "name", "badge", "description", "icon", "gradient", "colSpan", "priority", "isLocked", "isActive")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ("key") DO NOTHING;`,
          [
            item.key,
            item.name,
            item.badge,
            item.description,
            item.icon,
            item.gradient,
            item.colSpan,
            item.priority,
            item.isLocked,
            true,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('workspace_features');
    if (tableExists) {
      await queryRunner.dropTable('workspace_features');
    }
  }
}
