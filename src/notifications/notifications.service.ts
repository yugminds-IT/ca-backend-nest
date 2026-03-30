import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
  ) {}

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
