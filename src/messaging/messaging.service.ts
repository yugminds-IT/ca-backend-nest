import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Lead, LeadActivity } from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { canSeeLead } from '../access/permissions';
import { assertRecordInOrg, denyClients } from '../leads/lead-scope.util';
import { MessageChannel, toE164 } from './messaging.rules';
import { channelEnabled, sendTwilioMessage, twilioSettingsFromEnv, TwilioSettings } from './twilio.client';

/**
 * Sends SMS and WhatsApp messages to a lead and logs each one on the lead timeline.
 * A message that the provider accepts also counts as the first response for the lead's SLA.
 */
@Injectable()
export class MessagingService {
  private readonly settings: TwilioSettings | null = twilioSettingsFromEnv();

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    private readonly access: AccessService,
  ) {}

  status() {
    return {
      sms: channelEnabled(this.settings, 'sms'),
      whatsapp: channelEnabled(this.settings, 'whatsapp'),
    };
  }

  private async loadLead(user: User, leadId: number): Promise<Lead> {
    denyClients(user);
    const lead = await this.leads.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    assertRecordInOrg(user, lead.organizationId);
    const ctx = await this.access.contextFor(user);
    if (!canSeeLead(ctx, lead)) throw new NotFoundException('Lead not found');
    return lead;
  }

  async send(user: User, leadId: number, channel: MessageChannel, body: string) {
    const lead = await this.loadLead(user, leadId);
    const to = toE164(lead.phone);
    if (!to) throw new BadRequestException('This lead has no valid phone number');
    if (!this.settings || !channelEnabled(this.settings, channel)) {
      throw new ServiceUnavailableException(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} is not configured for this workspace`);
    }

    let sid: string;
    try {
      sid = await sendTwilioMessage(this.settings, channel, to, body);
    } catch {
      throw new BadGatewayException('The messaging provider did not accept the message');
    }

    const now = new Date();
    const activity = await this.activities.save(
      this.activities.create({
        organizationId: lead.organizationId,
        leadId: lead.id,
        type: channel,
        body: body.trim(),
        createdByUserId: user.id,
      }),
    );
    await this.leads.update({ id: lead.id }, { lastActivityAt: now });
    await this.leads.update({ id: lead.id, firstRespondedAt: IsNull() }, { firstRespondedAt: now });
    return { ok: true as const, providerMessageId: sid, activityId: activity.id };
  }
}
