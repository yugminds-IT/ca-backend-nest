import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Client } from '../entities/client.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(EmailSchedule)
    private scheduleRepo: Repository<EmailSchedule>,
    @InjectRepository(EmailTemplate)
    private templateRepo: Repository<EmailTemplate>,
  ) {}

  async getStats(currentUser: User) {
    const orgId = currentUser.organizationId;
    const isMaster = currentUser.role?.name === RoleName.MASTER_ADMIN;
    if (!orgId && !isMaster) {
      return {
        totalClients: 0,
        pendingEmails: 0,
        sentEmails: 0,
        failedEmails: 0,
        totalTemplates: 0,
        successRate: 0,
        recentActivity: [],
      };
    }

    const clientWhere = orgId ? { organizationId: orgId } : {};
    const scheduleWhere = orgId ? { organizationId: orgId } : {};
    const templateWhere = orgId
      ? [{ organizationId: orgId }, { organizationId: IsNull() }]
      : [{ organizationId: IsNull() }];

    const [totalClients, pendingEmails, sentEmails, failedEmails, totalTemplates, recentActivity] =
      await Promise.all([
        this.clientRepo.count({ where: clientWhere }),
        this.scheduleRepo.count({ where: { ...scheduleWhere, status: 'pending' } }),
        this.scheduleRepo.count({ where: { ...scheduleWhere, status: 'sent' } }),
        this.scheduleRepo.count({ where: { ...scheduleWhere, status: 'failed' } }),
        this.templateRepo.count({ where: templateWhere }),
        this.scheduleRepo.find({
          where: [
            { ...scheduleWhere, status: 'sent' },
            { ...scheduleWhere, status: 'failed' },
          ],
          order: { scheduledAt: 'DESC' },
          take: 6,
          relations: ['template'],
        }),
      ]);

    const totalProcessed = sentEmails + failedEmails;
    const successRate = totalProcessed > 0 ? Math.round((sentEmails / totalProcessed) * 100) : 0;

    return {
      totalClients,
      pendingEmails,
      sentEmails,
      failedEmails,
      totalTemplates,
      successRate,
      recentActivity: recentActivity.map((s) => ({
        id: s.id,
        status: s.status,
        recipientEmails: s.recipientEmails,
        templateName: s.template?.name ?? null,
        isCustom: s.templateId == null,
        scheduledAt: s.scheduledAt,
        sentAt: s.sentAt,
      })),
    };
  }
}
