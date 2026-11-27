import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadTask } from '../entities/crm.entities';
import { Client } from '../entities/client.entity';
import { Contact } from '../entities/contact.entity';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { applyLeadScope } from '../access/lead-scope';
import { denyClients, escapeLike, requireOrgScope } from '../leads/lead-scope.util';
import { GlobalSearchQuery, GlobalSearchResult, SearchHit } from './search.dto';

const MIN_TERM = 2;

/**
 * One search across leads, lead tasks, clients and contacts.
 * Leads and tasks follow the caller's data scope. Clients and contacts are not owned by anyone,
 * so they are shown only to callers with organization-wide or unit-level access.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadTask) private readonly tasks: Repository<LeadTask>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    private readonly access: AccessService,
  ) {}

  async search(user: User, query: GlobalSearchQuery): Promise<GlobalSearchResult> {
    denyClients(user);
    const orgId = requireOrgScope(user, query.organizationId);
    const term = (query.q ?? '').trim();
    const empty: GlobalSearchResult = { query: term, leads: [], tasks: [], clients: [], contacts: [] };
    if (term.length < MIN_TERM) return empty;

    const ctx = await this.access.contextFor(user);
    const like = `%${escapeLike(term)}%`;
    const limit = query.limit ?? 5;
    const unitId = query.businessUnitId;
    const orgWide = ctx.dataScope === 'org' || ctx.dataScope === 'units';

    const leadQb = this.leads
      .createQueryBuilder('l')
      .select(['l.id', 'l.name', 'l.email', 'l.company', 'l.status', 'l.businessUnitId'])
      .where('l.organizationId = :orgId', { orgId })
      .andWhere(
        '(l.name ILIKE :like OR l.email ILIKE :like OR l.phone ILIKE :like OR l.company ILIKE :like)',
        { like },
      );
    applyLeadScope(leadQb, ctx, 'l');
    if (unitId) leadQb.andWhere('l.businessUnitId = :unitId', { unitId });
    const leadRows = await leadQb.orderBy('l.updatedAt', 'DESC').take(limit).getMany();

    const taskQb = this.tasks
      .createQueryBuilder('t')
      .innerJoin('t.lead', 'l')
      .select(['t.id', 't.title', 't.dueAt', 't.completedAt', 'l.id', 'l.name', 'l.businessUnitId'])
      .where('t.organizationId = :orgId', { orgId })
      .andWhere('t.title ILIKE :like', { like });
    applyLeadScope(taskQb, ctx, 'l');
    if (unitId) taskQb.andWhere('l.businessUnitId = :unitId', { unitId });
    const taskRows = await taskQb.orderBy('t.createdAt', 'DESC').take(limit).getMany();

    let clientHits: SearchHit[] = [];
    let contactHits: SearchHit[] = [];
    if (orgWide) {
      const clientQb = this.clients
        .createQueryBuilder('c')
        .select(['c.id', 'c.name', 'c.email', 'c.companyName', 'c.businessUnitId'])
        .where('c.organizationId = :orgId', { orgId })
        .andWhere('(c.name ILIKE :like OR c.email ILIKE :like OR c.companyName ILIKE :like)', { like });
      if (ctx.dataScope === 'units') {
        if (ctx.unitIds.length === 0) clientQb.andWhere('1 = 0');
        else clientQb.andWhere('c.businessUnitId IN (:...unitIds)', { unitIds: ctx.unitIds });
      }
      if (unitId) clientQb.andWhere('c.businessUnitId = :unitId', { unitId });
      const rows = await clientQb.orderBy('c.name', 'ASC').take(limit).getMany();
      clientHits = rows.map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: c.companyName ?? c.email ?? null,
        businessUnitId: c.businessUnitId ?? null,
        href: `/client-management/${c.id}`,
      }));

      const contactQb = this.contacts
        .createQueryBuilder('k')
        .select(['k.id', 'k.firstName', 'k.lastName', 'k.email', 'k.businessUnitId'])
        .where('k.organizationId = :orgId', { orgId })
        .andWhere("(k.firstName ILIKE :like OR k.lastName ILIKE :like OR k.email ILIKE :like OR k.phone ILIKE :like)", { like });
      if (ctx.dataScope === 'units') {
        if (ctx.unitIds.length === 0) contactQb.andWhere('1 = 0');
        else contactQb.andWhere('k.businessUnitId IN (:...unitIds)', { unitIds: ctx.unitIds });
      }
      if (unitId) contactQb.andWhere('k.businessUnitId = :unitId', { unitId });
      const contactRows = await contactQb.orderBy('k.id', 'DESC').take(limit).getMany();
      contactHits = contactRows.map((k) => ({
        id: k.id,
        label: [k.firstName, k.lastName].filter(Boolean).join(' ') || k.email,
        sublabel: k.email,
        businessUnitId: k.businessUnitId ?? null,
        href: '/email-management',
      }));
    }

    return {
      query: term,
      leads: leadRows.map((l) => ({
        id: l.id,
        label: l.name,
        sublabel: [l.company, l.email].filter(Boolean).join(' · ') || null,
        businessUnitId: l.businessUnitId,
        href: `/leads/${l.id}`,
      })),
      tasks: taskRows.map((t) => ({
        id: t.id,
        label: t.title,
        sublabel: `${t.lead?.name ?? 'Lead'}${t.completedAt ? ' · done' : ''}`,
        businessUnitId: t.lead?.businessUnitId ?? null,
        href: `/leads/${t.lead?.id}`,
      })),
      clients: clientHits,
      contacts: contactHits,
    };
  }
}
