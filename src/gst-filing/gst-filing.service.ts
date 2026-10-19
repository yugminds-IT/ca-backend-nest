import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GstFilingSession, GstFilingStatus } from './gst-filing-session.entity';
import { CreateGstSessionDto } from './dto/gst-filing.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class GstFilingService {
  private readonly aiUrl = process.env.AI_ENGINE_URL ?? 'http://localhost:8001';

  constructor(
    @InjectRepository(GstFilingSession)
    private repo: Repository<GstFilingSession>,
  ) {}

  async create(dto: CreateGstSessionDto, user: User): Promise<GstFilingSession> {
    const session = this.repo.create({
      clientId: dto.clientId,
      organizationId: user.organizationId,
      status: GstFilingStatus.DRAFT,
    });
    return this.repo.save(session);
  }

  async findAll(user: User, clientId?: number): Promise<GstFilingSession[]> {
    const where: Record<string, any> = {
      organizationId: user.organizationId ?? undefined,
    };
    if (clientId) where.clientId = clientId;
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['client'],
    });
  }

  async findOne(id: string, user: User): Promise<GstFilingSession> {
    let session = await this.repo.findOne({
      where: { id, organizationId: user.organizationId ?? undefined },
      relations: ['client'],
    });
    if (!session) throw new NotFoundException('GST filing session not found');

    // Resolve pending Celery task inline so callers always get up-to-date status.
    if (session.status === GstFilingStatus.PROCESSING && session.celeryTaskId) {
      session = await this.resolvePendingTask(session);
    }

    return session;
  }

  private async resolvePendingTask(
    session: GstFilingSession,
  ): Promise<GstFilingSession> {
    try {
      const res = await fetch(
        `${this.aiUrl}/api/v1/gst/status/${session.celeryTaskId}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) return session;

      const data = (await res.json()) as any;
      if (data.status === 'SUCCESS') {
        // Celery result shape: { status, file_path, filename, summary, data: ExtractionResult }
        const extractionResult = data.result?.data ?? {};
        this.applyExtractionResult(session, extractionResult);
        return this.repo.save(session);
      }
      if (data.status === 'FAILURE') {
        session.status = GstFilingStatus.FAILED;
        session.celeryTaskId = null;
        return this.repo.save(session);
      }
    } catch {
      // Task poll failed — leave session in PROCESSING; try again next poll.
    }
    return session;
  }

  async uploadDocument(
    id: string,
    file: Express.Multer.File,
    user: User,
  ): Promise<GstFilingSession> {
    const session = await this.findOne(id, user);

    session.documentName = file.originalname;
    session.documentType = file.mimetype;
    session.status = GstFilingStatus.PROCESSING;
    session.celeryTaskId = null;
    await this.repo.save(session);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );

    // Sync extraction — runs inline in the AI service, no Celery worker needed.
    let res: Response;
    try {
      res = await fetch(`${this.aiUrl}/api/v1/gst/extract/sync`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(600_000), // 10 min ceiling
      });
    } catch (err: any) {
      session.status = GstFilingStatus.FAILED;
      await this.repo.save(session);
      throw new BadRequestException(`GST extraction request failed: ${err?.message ?? err}`);
    }

    if (!res.ok) {
      session.status = GstFilingStatus.FAILED;
      await this.repo.save(session);
      const msg = await res.text();
      throw new BadRequestException(`GST extraction failed: ${msg}`);
    }

    const data = (await res.json()) as { status: string; result: any };
    this.applyExtractionResult(session, data.result ?? {});
    return this.repo.save(session);
  }

  /**
   * Map an ExtractionResult model_dump (from Celery task `data` field) onto the session.
   * Shape: { source_file, total_pages, total_invoices, records: [{invoice, validation}] }
   */
  private applyExtractionResult(
    session: GstFilingSession,
    extractionResult: any,
  ): GstFilingSession {
    const records: any[] = extractionResult.records ?? [];

    const invoices = records.map((rec: any) => {
      const inv = rec.invoice ?? {};
      const val = rec.validation ?? {};
      return {
        invoice_no:    inv.invoice_no    ?? '',
        invoice_date:  inv.invoice_date  ?? '',
        party_name:    inv.party_name    ?? '',
        gstin:         inv.gstin         ?? '',
        taxable_value: String(inv.taxable_value ?? ''),
        cgst:          String(inv.cgst   ?? ''),
        sgst:          String(inv.sgst   ?? ''),
        igst:          String(inv.igst   ?? ''),
        total:         String(inv.total  ?? ''),
        page_no:       inv.page_no       ?? 1,
        status:        val.status        ?? 'ok',
        issues: [
          ...(Array.isArray(val.errors)   ? val.errors   : []),
          ...(Array.isArray(val.warnings) ? val.warnings : []),
        ],
      };
    });

    const okCount     = invoices.filter((i) => i.status === 'ok').length;
    const reviewCount = invoices.filter((i) => i.status === 'review').length;
    const errorCount  = invoices.filter((i) => i.status === 'error').length;

    const toMsg = (x: any): string =>
      typeof x === 'string' ? x : (x?.message ?? String(x));

    session.extractedData = { total_invoices: invoices.length, invoices };
    session.comparisonData = {
      match: {
        is_valid: errorCount === 0,
        total_invoices: invoices.length,
        ok_count: okCount,
        review_count: reviewCount,
        error_count: errorCount,
      },
      validation: {
        errors: [
          ...new Set(
            invoices
              .filter((i) => i.status === 'error')
              .flatMap((i) => (Array.isArray(i.issues) ? i.issues : []).map(toMsg)),
          ),
        ],
        warnings: [
          ...new Set(
            invoices
              .filter((i) => i.status === 'review')
              .flatMap((i) => (Array.isArray(i.issues) ? i.issues : []).map(toMsg)),
          ),
        ],
      },
    };

    const firstDate = invoices[0]?.invoice_date as string | undefined;
    if (firstDate) {
      const parts = firstDate.split('-');
      if (parts.length === 3) {
        const [, mm, yyyy] = parts;
        const month = Number(mm);
        const year  = Number(yyyy);
        const d = new Date(year, month - 1);
        session.period = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
        const fyStart = month >= 4 ? year : year - 1;
        session.financialYear = `${fyStart}-${String(fyStart + 1).slice(2)}`;
      }
    }

    // Mirror period/financialYear into extractedData so the frontend can read them
    // from local state (extractedData.period / extractedData.financial_year).
    session.extractedData = {
      ...session.extractedData,
      period: session.period ?? null,
      financial_year: session.financialYear ?? null,
    };

    session.status = GstFilingStatus.UPLOADED;
    session.celeryTaskId = null;
    return session;
  }

  async compare(id: string, user: User): Promise<GstFilingSession> {
    const session = await this.findOne(id, user);
    if (!session.extractedData) {
      throw new BadRequestException('Upload a document before comparing');
    }
    session.status = GstFilingStatus.COMPARED;
    return this.repo.save(session);
  }

  async remove(id: string, user: User): Promise<void> {
    const session = await this.findOne(id, user);
    await this.repo.remove(session);
  }
}
