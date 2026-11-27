import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { INDUSTRY_PRESETS } from '../common/industry-presets';
import { INDUSTRY_PIPELINE_STAGES } from '../common/industry-pipelines';
import { UpdateIndustryTemplateDto } from './industry-templates.dto';

export interface IndustryView {
  key: string;
  name: string;
  description: string;
  icon: string;
  variables: IndustryTemplate['variables'];
  starterTemplates: IndustryTemplate['starterTemplates'];
  pipelineStages: IndustryTemplate['pipelineStages'];
}

const toView = (t: IndustryTemplate): IndustryView => ({
  key: t.key,
  name: t.name,
  description: t.description,
  icon: t.icon,
  variables: t.variables ?? [],
  starterTemplates: t.starterTemplates ?? [],
  pipelineStages: t.pipelineStages ?? [],
});

/** Code-defined fallback, used only if the table has no row for a key (for example before the migration runs). */
function fallbackView(key: string): IndustryView | null {
  const preset = INDUSTRY_PRESETS[key];
  if (!preset) return null;
  return {
    key: preset.key,
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    variables: preset.variables ?? [],
    starterTemplates: preset.starterTemplates ?? [],
    pipelineStages: INDUSTRY_PIPELINE_STAGES[key] ?? INDUSTRY_PIPELINE_STAGES.custom,
  };
}

@Injectable()
export class IndustryTemplatesService {
  private readonly logger = new Logger(IndustryTemplatesService.name);

  constructor(
    @InjectRepository(IndustryTemplate)
    private readonly templates: Repository<IndustryTemplate>,
  ) {}

  async list(): Promise<IndustryView[]> {
    const rows = await this.templates.find({ order: { name: 'ASC' } });
    if (rows.length > 0) return rows.map(toView);
    this.logger.warn('industry_templates is empty; serving code-defined presets');
    return Object.keys(INDUSTRY_PRESETS).map((k) => fallbackView(k)!).filter(Boolean);
  }

  /** The template for a key, or the "custom" template when the key is unknown. Null only if nothing is seeded at all. */
  async getOrDefault(key: string | null | undefined): Promise<IndustryView | null> {
    const row = key ? await this.templates.findOne({ where: { key } }) : null;
    if (row) return toView(row);
    const fallback = key ? fallbackView(key) : null;
    if (fallback) return fallback;
    const custom = await this.templates.findOne({ where: { key: 'custom' } });
    return custom ? toView(custom) : fallbackView('custom');
  }

  async get(key: string): Promise<IndustryView> {
    const view = await this.getOrDefault(key);
    if (!view || view.key !== key) throw new NotFoundException('Industry template not found');
    return view;
  }

  /** Master admins only (enforced by the controller). Only the fields listed in the DTO can change. */
  async update(key: string, dto: UpdateIndustryTemplateDto): Promise<IndustryView> {
    const row = await this.templates.findOne({ where: { key } });
    if (!row) throw new NotFoundException('Industry template not found');
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.pipelineStages !== undefined) {
      const won = dto.pipelineStages.filter((s) => s.isWon).length;
      if (won > 1) throw new BadRequestException('A pipeline can have only one won stage');
      row.pipelineStages = dto.pipelineStages.map((s) => ({
        name: s.name.trim(),
        probability: s.probability,
        ...(s.isWon ? { isWon: true } : {}),
        ...(s.isLost ? { isLost: true } : {}),
      }));
    }
    return toView(await this.templates.save(row));
  }
}
