import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { AuditEvent } from '../entities/audit-event.entity';

export interface AuditInput {
  organizationId: number;
  actor?: { id: number; name?: string | null; email?: string | null } | null;
  action: string;
  summary: string;
  targetType?: string;
  targetId?: number | null;
}

/** Records who changed staff, profiles and teams. Kept longer than activity logs. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent) private readonly repo: Repository<AuditEvent>,
  ) {}

  /** Never throws: an audit write must not break the change it records. */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          organizationId: input.organizationId,
          actorUserId: input.actor?.id ?? null,
          actorName: input.actor ? (input.actor.name || input.actor.email || null) : null,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          summary: input.summary.slice(0, 500),
        }),
      );
    } catch (err) {
      this.logger.warn(`Audit write failed for ${input.action}: ${(err as Error).message}`);
    }
  }

  /** Newest first. `actionPrefix` matches the start of the action, e.g. "staff." or "team.". */
  async list(orgId: number, opts: { actionPrefix?: string; limit?: number } = {}): Promise<AuditEvent[]> {
    return this.repo.find({
      where: {
        organizationId: orgId,
        ...(opts.actionPrefix ? { action: Like(`${opts.actionPrefix}%`) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
    });
  }
}
