import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification } from '../entities/notification.entity';

export interface CreateNotificationData {
  type?: string;
  organizationId?: number | null;
  clientId?: number | null;
  clientName?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  message?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
  ) {}

  /** Runs every hour — deletes notifications older than 24 hours. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeOldNotifications(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Purged ${result.affected} notification(s) older than 24 hours`);
    }
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    return this.repo.save(
      this.repo.create({
        type: data.type ?? 'document_upload',
        organizationId: data.organizationId ?? null,
        clientId: data.clientId ?? null,
        clientName: data.clientName ?? null,
        fileName: data.fileName ?? null,
        fileType: data.fileType ?? null,
        fileSize: data.fileSize ?? null,
        message: data.message ?? null,
        isRead: false,
      }),
    );
  }

  async findAll(
    organizationId: number,
    skip = 0,
    limit = 50,
  ): Promise<{ notifications: Notification[]; total: number; unread: number }> {
    const [notifications, total] = await this.repo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const unread = await this.repo.count({ where: { organizationId, isRead: false } });
    return { notifications, total, unread };
  }

  async markRead(id: number, organizationId: number): Promise<Notification> {
    const notification = await this.repo.findOne({ where: { id, organizationId } });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.isRead = true;
    return this.repo.save(notification);
  }

  async markAllRead(organizationId: number): Promise<void> {
    await this.repo.update({ organizationId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(organizationId: number): Promise<number> {
    return this.repo.count({ where: { organizationId, isRead: false } });
  }
}
