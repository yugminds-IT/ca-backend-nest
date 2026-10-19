import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TdsFilingSession, TdsFilingStatus } from './tds-filing-session.entity';
import { CreateTdsSessionDto, SetFormTypeDto } from './dto/tds-filing.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class TdsFilingService {
  private readonly aiUrl = process.env.AI_ENGINE_URL ?? 'http://localhost:8001';

  constructor(
    @InjectRepository(TdsFilingSession)
    private repo: Repository<TdsFilingSession>,
  ) {}

  // ------------------------------------------------------------------ sessions

  async create(dto: CreateTdsSessionDto, user: User): Promise<TdsFilingSession> {
    const session = this.repo.create({
      clientId: dto.clientId,
      organizationId: user.organizationId,
      status: TdsFilingStatus.DRAFT,
    });
    return this.repo.save(session);
  }

  async findAll(user: User): Promise<TdsFilingSession[]> {
    const orgId = user.organizationId ?? undefined;
    return this.repo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
      relations: ['client'],
    });
  }

  async findOne(id: string, user: User): Promise<TdsFilingSession> {
    const orgId = user.organizationId ?? undefined;
    const session = await this.repo.findOne({
      where: { id, organizationId: orgId },
      relations: ['client'],
    });
    if (!session) throw new NotFoundException('TDS filing session not found');
    return session;
  }

  // ------------------------------------------------------------------ uploads

  async uploadChallan(
    id: string,
    file: Express.Multer.File,
    user: User,
  ): Promise<TdsFilingSession> {
    const session = await this.findOne(id, user);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);

    const res = await fetch(`${this.aiUrl}/api/v1/tds/upload/challan`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new BadRequestException(`Challan extraction failed: ${msg}`);
    }

    const data = (await res.json()) as any;
    session.challanData = data.challan;
    session.assessmentYear = data.challan?.fields?.assessment_year ?? null;
    session.financialYear  = data.challan?.fields?.financial_year ?? null;
    session.status = TdsFilingStatus.CHALLAN_UPLOADED;
    return this.repo.save(session);
  }

  async uploadExcel(
    id: string,
    file: Express.Multer.File,
    user: User,
  ): Promise<TdsFilingSession> {
    const session = await this.findOne(id, user);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    form.append('tds_type', 'salary');

    const res = await fetch(`${this.aiUrl}/api/v1/tds/upload/excel`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new BadRequestException(`Excel extraction failed: ${msg}`);
    }

    const data = (await res.json()) as any;
    session.deducteesData = data.deductees;
    session.status = TdsFilingStatus.EXCEL_UPLOADED;
    return this.repo.save(session);
  }

  // ------------------------------------------------------------------ compare

  async compare(id: string, user: User): Promise<TdsFilingSession> {
    const session = await this.findOne(id, user);
    if (!session.challanData || !session.deducteesData) {
      throw new BadRequestException('Upload both challan PDF and deductee Excel before comparing');
    }

    const res = await fetch(`${this.aiUrl}/api/v1/tds/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challan:   session.challanData,
        deductees: session.deducteesData,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new InternalServerErrorException(`Comparison failed: ${msg}`);
    }

    const data = (await res.json()) as any;
    session.comparisonData = data;
    session.status = TdsFilingStatus.COMPARED;
    return this.repo.save(session);
  }

  // ----------------------------------------------------------------- form type

  async setFormType(id: string, dto: SetFormTypeDto, user: User): Promise<TdsFilingSession> {
    const session = await this.findOne(id, user);
    session.formType         = dto.formType;
    session.formVersion      = dto.formVersion;
    session.quarter          = dto.quarter;
    session.selectedSections = dto.selectedSections;
    session.status           = TdsFilingStatus.FORM_SELECTED;
    return this.repo.save(session);
  }

  // ----------------------------------------------------------------- generate

  async generate(id: string, user: User): Promise<TdsFilingSession> {
    const session = await this.findOne(id, user);
    if (!session.comparisonData || !session.formType || !session.quarter) {
      throw new BadRequestException('Complete comparison and form selection before generating');
    }

    const autoFill = (session.comparisonData as any)?.auto_fill ?? {};
    const challanData = session.challanData ?? {};

    const deductor = {
      tan:  autoFill.deductor_tan  ?? '',
      name: autoFill.deductor_name ?? '',
      type: 'company',
    };

    const tdsTypeMap: Record<string, string> = {
      '24Q': 'salary', '26Q': 'professional', '27Q': 'professional', '27EQ': 'professional',
    };
    const tds_type = tdsTypeMap[session.formType] ?? 'salary';

    const [csiRes, fvuRes] = await Promise.all([
      fetch(`${this.aiUrl}/api/v1/tds/generate/csi/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challan: challanData, status: 'F' }),
      }),
      fetch(`${this.aiUrl}/api/v1/tds/generate/fvu/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tds_type,
          quarter:   session.quarter,
          challan:   challanData,
          deductees: session.deducteesData ?? [],
          deductor,
        }),
      }),
    ]);

    if (!csiRes.ok) {
      const msg = await csiRes.text();
      throw new InternalServerErrorException(`CSI generation failed: ${msg}`);
    }
    if (!fvuRes.ok) {
      const msg = await fvuRes.text();
      throw new InternalServerErrorException(`FVU generation failed: ${msg}`);
    }

    const csiData = (await csiRes.json()) as any;
    const fvuData = (await fvuRes.json()) as any;

    session.generatedFiles = {
      csi_filename: csiData.filename,
      fvu_filename: fvuData.filename,
    };
    session.status = TdsFilingStatus.COMPLETED;
    return this.repo.save(session);
  }

  // ----------------------------------------------------------- status / download

  async getGenerationStatus(id: string, user: User): Promise<any> {
    const session = await this.findOne(id, user);
    const files = session.generatedFiles as any;
    if (!files) return { session_status: session.status };

    const results: any = { session_status: session.status };

    const [csiStatus, fvuStatus] = await Promise.all([
      files.csi_task_id
        ? fetch(`${this.aiUrl}/api/v1/tds/status/${files.csi_task_id}`).then((r) => r.json())
        : Promise.resolve(null),
      files.fvu_task_id
        ? fetch(`${this.aiUrl}/api/v1/tds/status/${files.fvu_task_id}`).then((r) => r.json())
        : Promise.resolve(null),
    ]);

    results.csi = csiStatus;
    results.fvu = fvuStatus;

    if (
      csiStatus?.status === 'SUCCESS' &&
      fvuStatus?.status === 'SUCCESS' &&
      session.status === TdsFilingStatus.GENERATING
    ) {
      session.status = TdsFilingStatus.COMPLETED;
      await this.repo.save(session);
      results.session_status = TdsFilingStatus.COMPLETED;
    } else if (
      (csiStatus?.status === 'FAILURE' || fvuStatus?.status === 'FAILURE') &&
      session.status === TdsFilingStatus.GENERATING
    ) {
      session.status = TdsFilingStatus.FAILED;
      await this.repo.save(session);
      results.session_status = TdsFilingStatus.FAILED;
    }

    return results;
  }

  async getForms(): Promise<any> {
    const res = await fetch(`${this.aiUrl}/api/v1/tds/forms`);
    if (!res.ok) throw new InternalServerErrorException('Could not fetch form registry from AI engine');
    return res.json();
  }

  async downloadFile(id: string, fileType: 'csi' | 'fvu', user: User): Promise<{ url: string; filename: string }> {
    const session = await this.findOne(id, user);
    const files = session.generatedFiles as any;
    if (!files) throw new NotFoundException('No generated files for this session');
    const filename = fileType === 'csi' ? files.csi_filename : files.fvu_filename;
    if (!filename) throw new NotFoundException(`No ${fileType.toUpperCase()} file found`);
    return { url: `${this.aiUrl}/api/v1/tds/download/file/${filename}`, filename };
  }

  async remove(id: string, user: User): Promise<void> {
    const session = await this.findOne(id, user);
    await this.repo.remove(session);
  }
}
