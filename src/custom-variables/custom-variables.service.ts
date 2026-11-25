import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { ClientCustomValue, CustomVariable } from '../entities/custom-variable.entity';
import { User } from '../entities/user.entity';
import { TEMPLATE_VARIABLES } from '../email-templates/constants/template-variables';
import { CreateCustomVariableDto, UpdateCustomVariableDto } from './dto/custom-variable.dto';

/** Keys the catalog already owns ({{client_name}} etc.) can't be reused. */
export const RESERVED_KEYS = new Set(TEMPLATE_VARIABLES.map((v) => v.key.replace(/[{}\s]/g, '')));

@Injectable()
export class CustomVariablesService {
  constructor(
    @InjectRepository(CustomVariable) private vars: Repository<CustomVariable>,
    @InjectRepository(ClientCustomValue) private values: Repository<ClientCustomValue>,
    @InjectRepository(Client) private clients: Repository<Client>,
  ) {}

  private orgOf(user: User): number {
    if (user.organizationId == null) throw new ForbiddenException('Custom variables belong to an organization');
    return user.organizationId;
  }

  private async own(user: User, id: number): Promise<CustomVariable> {
    const v = await this.vars.findOne({ where: { id, organizationId: this.orgOf(user) } });
    if (!v) throw new NotFoundException('Custom variable not found');
    return v;
  }

  /** The org's variables, each with every client's value ({ clientId: value }). */
  // ponytail: one payload with all clients' values; fetch per client if orgs reach thousands of clients x variables
  async list(user: User) {
    if (user.organizationId == null) return [];
    const vars = await this.vars.find({ where: { organizationId: user.organizationId }, order: { label: 'ASC' } });
    const vals = vars.length ? await this.values.find({ where: { variableId: In(vars.map((v) => v.id)) } }) : [];
    return vars.map((v) => ({
      ...v,
      values: Object.fromEntries(vals.filter((x) => x.variableId === v.id).map((x) => [x.clientId, x.value])),
    }));
  }

  async create(user: User, dto: CreateCustomVariableDto) {
    const organizationId = this.orgOf(user);
    const key = dto.key.trim().toLowerCase();
    if (RESERVED_KEYS.has(key)) throw new BadRequestException(`{{${key}}} is already a built-in variable`);
    if (await this.vars.exist({ where: { organizationId, key } })) throw new ConflictException(`{{${key}}} already exists`);
    const saved = await this.vars.save(
      this.vars.create({ organizationId, key, label: dto.label.trim(), defaultValue: dto.defaultValue?.trim() ?? '' }),
    );
    return { ...saved, values: {} };
  }

  async update(user: User, id: number, dto: UpdateCustomVariableDto) {
    const v = await this.own(user, id);
    if (dto.label != null) v.label = dto.label.trim();
    if (dto.defaultValue != null) v.defaultValue = dto.defaultValue.trim();
    return this.vars.save(v);
  }

  async remove(user: User, id: number) {
    await this.vars.remove(await this.own(user, id)); // client values go with it (ON DELETE CASCADE)
  }

  /** Save one client's values by key; an empty value clears it (the default applies again). */
  async setClientValues(user: User, clientId: number, input: Record<string, string>) {
    const organizationId = this.orgOf(user);
    if (!(await this.clients.exist({ where: { id: clientId, organizationId } }))) throw new NotFoundException('Client not found');
    const vars = await this.vars.find({ where: { organizationId } });
    const byKey = new Map(vars.map((v) => [v.key, v]));
    const unknown = Object.keys(input).filter((k) => !byKey.has(k));
    if (unknown.length) throw new BadRequestException(`Unknown custom variable(s): ${unknown.join(', ')}`);

    const entries = Object.entries(input).map(([k, value]) => ({ variableId: byKey.get(k)!.id, value: String(value ?? '').trim() }));
    const cleared = entries.filter((e) => !e.value).map((e) => e.variableId);
    const set = entries.filter((e) => e.value).map((e) => ({ clientId, ...e }));
    if (cleared.length) await this.values.delete({ clientId, variableId: In(cleared) });
    if (set.length) await this.values.upsert(set, ['clientId', 'variableId']);
    return { saved: set.length, cleared: cleared.length };
  }

  /** Values for one recipient: each variable's default, overridden by that client's own value (matched by email). */
  /** Each client's values (their own, else the default), for many clients in two queries. */
  async valuesForClients(organizationId: number, clientIds: number[]): Promise<Map<number, Record<string, string>>> {
    const out = new Map<number, Record<string, string>>();
    const vars = await this.vars.find({ where: { organizationId } });
    if (!vars.length) return out;
    const defaults = Object.fromEntries(vars.filter((v) => v.defaultValue).map((v) => [v.key, v.defaultValue]));
    for (const id of clientIds) out.set(id, { ...defaults });
    const keyOf = new Map(vars.map((v) => [v.id, v.key]));
    for (let i = 0; i < clientIds.length; i += 1000) {
      const own = await this.values.find({ where: { clientId: In(clientIds.slice(i, i + 1000)), variableId: In([...keyOf.keys()]) } });
      for (const x of own) if (x.value) out.get(x.clientId)![keyOf.get(x.variableId)!] = x.value;
    }
    return out;
  }

  async valuesFor(organizationId: number | null | undefined, email: string): Promise<Record<string, string>> {
    if (organizationId == null) return {};
    const vars = await this.vars.find({ where: { organizationId } });
    if (!vars.length) return {};
    const out: Record<string, string> = {};
    for (const v of vars) if (v.defaultValue) out[v.key] = v.defaultValue;
    const client = await this.clients
      .createQueryBuilder('c')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(c.email) = LOWER(:email)', { email })
      .getOne();
    if (client) {
      const keyOf = new Map(vars.map((v) => [v.id, v.key]));
      const own = await this.values.find({ where: { clientId: client.id, variableId: In([...keyOf.keys()]) } });
      for (const x of own) out[keyOf.get(x.variableId)!] = x.value;
    }
    return out;
  }
}
