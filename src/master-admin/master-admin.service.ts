import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { User } from '../entities/user.entity';
import { Organization } from '../entities/organization.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { EmailService } from '../email/email.service';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class MasterAdminService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(EmailTemplate)
    private templateRepo: Repository<EmailTemplate>,
    @InjectRepository(EmailSchedule)
    private scheduleRepo: Repository<EmailSchedule>,
    private emailService: EmailService,
  ) {}

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats() {
    const [totalUsers, totalOrganizations, totalEmailTemplates] = await Promise.all([
      this.userRepo.count(),
      this.orgRepo.count(),
      this.templateRepo.count(),
    ]);

    // User breakdown by role
    const usersByRoleRaw = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin('u.role', 'r')
      .select('r.name', 'roleName')
      .addSelect('COUNT(u.id)', 'count')
      .groupBy('r.name')
      .getRawMany<{ roleName: string; count: string }>();

    const usersByRole: Record<string, number> = {};
    for (const row of usersByRoleRaw) {
      if (row.roleName) usersByRole[row.roleName] = parseInt(row.count, 10);
    }

    // Recent (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentUsers, recentOrganizations] = await Promise.all([
      this.userRepo.count({ where: { createdAt: MoreThanOrEqual(thirtyDaysAgo) } }),
      this.orgRepo.count({ where: { createdAt: MoreThanOrEqual(thirtyDaysAgo) } }),
    ]);

    const monthlyRegistrations = await this.getMonthlyRegistrations(7);

    return {
      totalUsers,
      totalOrganizations,
      totalEmailTemplates,
      usersByRole,
      recentUsers,
      recentOrganizations,
      monthlyRegistrations,
    };
  }

  // ─── Activity ─────────────────────────────────────────────────────────────

  async getActivity(limit = 20) {
    const perType = Math.ceil(limit / 3);

    const [recentUsers, recentOrgs, recentSchedules] = await Promise.all([
      this.userRepo.find({
        relations: ['role', 'organization'],
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      this.orgRepo.find({
        order: { createdAt: 'DESC' },
        take: perType,
      }),
      this.scheduleRepo.find({
        order: { createdAt: 'DESC' },
        take: perType,
      }),
    ]);

    type ActivityEvent = {
      id: string;
      type: string;
      title: string;
      description: string;
      entityType: string;
      entityId: number;
      timestamp: Date;
    };

    const events: ActivityEvent[] = [];

    for (const user of recentUsers) {
      events.push({
        id: `user-${user.id}`,
        type: 'user_created',
        title: 'New user registered',
        description: `${user.email} joined as ${user.role?.name ?? 'user'}${user.organization ? ` in ${user.organization.name}` : ''}`,
        entityType: 'user',
        entityId: user.id,
        timestamp: user.createdAt,
      });
    }

    for (const org of recentOrgs) {
      events.push({
        id: `org-${org.id}`,
        type: 'org_created',
        title: 'Organization registered',
        description: `${org.name} was added to the platform`,
        entityType: 'organization',
        entityId: org.id,
        timestamp: org.createdAt,
      });
    }

    for (const schedule of recentSchedules) {
      const recipientCount = schedule.recipientEmails?.length ?? 0;
      events.push({
        id: `schedule-${schedule.id}`,
        type: 'email_scheduled',
        title: 'Email scheduled',
        description: `Scheduled to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''} — status: ${schedule.status}`,
        entityType: 'email_schedule',
        entityId: schedule.id,
        timestamp: schedule.createdAt,
      });
    }

    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics() {
    const stats = await this.getStats();

    // Emails sent this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const emailsSentThisWeek = await this.scheduleRepo.count({
      where: { status: 'sent', sentAt: MoreThanOrEqual(weekAgo) },
    });

    // User growth vs last month
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [usersThisMonth, usersLastMonth] = await Promise.all([
      this.userRepo.count({ where: { createdAt: Between(thirtyDaysAgo, now) } }),
      this.userRepo.count({ where: { createdAt: Between(sixtyDaysAgo, thirtyDaysAgo) } }),
    ]);

    const userGrowthPercent =
      usersLastMonth === 0
        ? usersThisMonth > 0
          ? 100
          : 0
        : Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100);

    return {
      ...stats,
      userGrowthPercent,
      newOrganizationsThisMonth: stats.recentOrganizations,
      emailsSentThisWeek,
      usersByRolePercent: this.computePercentages(stats.usersByRole, stats.totalUsers),
    };
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  async getNotifications(limit = 20) {
    const activity = await this.getActivity(limit);

    return activity.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      description: event.description,
      entityType: event.entityType,
      entityId: event.entityId,
      timestamp: event.timestamp,
      severity:
        event.type === 'user_created'
          ? 'info'
          : event.type === 'org_created'
          ? 'success'
          : 'info',
    }));
  }

  // ─── CSV Exports ──────────────────────────────────────────────────────────

  async exportUsersCsv(): Promise<string> {
    const users = await this.userRepo.find({
      relations: ['role', 'organization'],
      order: { createdAt: 'DESC' },
    });

    const header = 'ID,Name,Email,Phone,Role,Organization,Created At';
    const rows = users.map((u) =>
      [
        u.id,
        `"${(u.name ?? '').replace(/"/g, '""')}"`,
        u.email,
        u.phone ?? '',
        u.role?.name ?? '',
        `"${(u.organization?.name ?? '').replace(/"/g, '""')}"`,
        u.createdAt?.toISOString() ?? '',
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  async exportOrganizationsCsv(): Promise<string> {
    const orgs = await this.orgRepo.find({ order: { name: 'ASC' } });

    const header = 'ID,Name,City,State,Country,Pincode,Created At';
    const rows = orgs.map((o) =>
      [
        o.id,
        `"${o.name.replace(/"/g, '""')}"`,
        o.city ?? '',
        o.state ?? '',
        o.country ?? '',
        o.pincode ?? '',
        o.createdAt?.toISOString() ?? '',
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  // ─── Organization approval & access ───────────────────────────────────────

  async listPendingOrganizations(): Promise<Organization[]> {
    return this.orgRepo.find({
      where: { approvalStatus: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  async approveOrganization(id: number): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus !== 'pending') {
      throw new BadRequestException('Only pending organizations can be approved');
    }
    const trialDays = parseInt(process.env.ORG_TRIAL_DAYS ?? '7', 10);
    const accessUntil = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    org.approvalStatus = 'approved';
    org.approvedAt = new Date();
    org.accessUntil = accessUntil;
    await this.orgRepo.save(org);

    const admin = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin('u.role', 'r')
      .where('u.organizationId = :oid', { oid: id })
      .andWhere('r.name = :rname', { rname: RoleName.ORG_ADMIN })
      .orderBy('u.id', 'ASC')
      .getOne();

    if (admin?.email) {
      void this.emailService.sendOrganizationApprovedToAdmin({
        adminEmail: admin.email,
        organizationName: org.name,
        accessUntil,
      });
    }

    return org;
  }

  async rejectOrganization(id: number): Promise<{ message: string }> {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.approvalStatus !== 'pending') {
      throw new BadRequestException('Only pending organizations can be rejected');
    }
    org.approvalStatus = 'rejected';
    await this.orgRepo.save(org);
    return { message: 'Organization registration rejected.' };
  }

  async extendOrganizationAccess(id: number, accessUntil: Date): Promise<Organization> {
    if (Number.isNaN(accessUntil.getTime())) {
      throw new BadRequestException('Invalid accessUntil date');
    }
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    org.approvalStatus = 'approved';
    org.accessUntil = accessUntil;
    if (!org.approvedAt) org.approvedAt = new Date();
    await this.orgRepo.save(org);
    return org;
  }

  /** Daily cron: email team a list of pending org signups (from Lekvya). */
  async sendDailyPendingDigestEmail(): Promise<void> {
    const pending = await this.orgRepo.find({
      where: { approvalStatus: 'pending' },
      order: { createdAt: 'ASC' },
    });
    const lines: { orgName: string; adminEmail: string; createdAt: Date }[] = [];
    for (const org of pending) {
      const admin = await this.userRepo
        .createQueryBuilder('u')
        .leftJoin('u.role', 'r')
        .where('u.organizationId = :oid', { oid: org.id })
        .andWhere('r.name = :rname', { rname: RoleName.ORG_ADMIN })
        .orderBy('u.id', 'ASC')
        .getOne();
      lines.push({
        orgName: org.name,
        adminEmail: admin?.email ?? '—',
        createdAt: org.createdAt,
      });
    }
    await this.emailService.sendPendingOrganizationsDigestToTeam(lines);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private computePercentages(
    usersByRole: Record<string, number>,
    total: number,
  ): Record<string, number> {
    if (total === 0) return {};
    const result: Record<string, number> = {};
    for (const [role, count] of Object.entries(usersByRole)) {
      result[role] = Math.round((count / total) * 100);
    }
    return result;
  }

  private async getMonthlyRegistrations(months: number): Promise<{ month: string; year: number; users: number; organizations: number }[]> {
    const result: { month: string; year: number; users: number; organizations: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const [users, organizations] = await Promise.all([
        this.userRepo.count({ where: { createdAt: Between(from, to) } }),
        this.orgRepo.count({ where: { createdAt: Between(from, to) } }),
      ]);

      result.push({
        month: from.toLocaleString('default', { month: 'short' }),
        year: from.getFullYear(),
        users,
        organizations,
      });
    }

    return result;
  }
}
