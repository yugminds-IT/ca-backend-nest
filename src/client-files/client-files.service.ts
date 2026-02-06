import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import fileType from 'file-type';
import { User } from '../entities/user.entity';
import { Client } from '../entities/client.entity';
import { ClientFile } from '../entities/client-file.entity';
import { S3Service } from '../s3/s3.service';
import { RoleName } from '../common/enums/role.enum';

const ORG_ROLES = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'image/',
  'text/plain',
  'text/csv',
];

function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(i + 1).toLowerCase() : '';
}

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(p));
}

export interface UploadedFileResponse {
  id: number;
  fileName: string;
  type: string | null;
  format: string;
  date: string;
  time: string;
  /** Presigned S3 URL to view/download the file (included in list so UI can open it). */
  previewUrl?: string;
  /** Same as previewUrl – use either to view the file in browser. */
  viewUrl?: string;
  downloadUrl?: string;
}

@Injectable()
export class ClientFilesService {
  constructor(
    @InjectRepository(ClientFile)
    private repo: Repository<ClientFile>,
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    private s3: S3Service,
  ) {}

  private async getClientId(user: User): Promise<number> {
    if (user.role?.name !== RoleName.CLIENT) {
      throw new ForbiddenException('Only clients can upload or list their files');
    }
    const client = await this.clientRepo.findOne({ where: { userId: user.id } });
    if (!client) throw new ForbiddenException('Client profile not found');
    return client.id;
  }

  async uploadFiles(
    files: Express.Multer.File[],
    currentUser: User,
    documentType?: string,
  ): Promise<UploadedFileResponse[]> {
    const clientId = await this.getClientId(currentUser);
    const bucket = this.s3.getBucket();
    const results: UploadedFileResponse[] = [];

    for (const file of files) {
      if (!file.buffer || file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `File ${file.originalname} exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB or is empty`,
        );
      }
      const detected = await fileType.fromBuffer(file.buffer);
      const mime = detected?.mime ?? file.mimetype ?? 'application/octet-stream';
      if (!isAllowedMime(mime)) {
        throw new BadRequestException(
          `File type not allowed: ${file.originalname} (${mime})`,
        );
      }
      const ext = (detected?.ext ?? getExtension(file.originalname)) || 'bin';
      const safeName = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Key = `clients/${clientId}/${randomUUID()}_${safeName}`;
      await this.s3.upload(s3Key, file.buffer, mime);

      const record = await this.repo.save(
        this.repo.create({
          clientId,
          fileName: file.originalname || safeName,
          type: documentType ?? null,
          format: ext,
          mimeType: mime,
          fileSize: file.size,
          s3Key,
          s3Bucket: bucket,
        }),
      );
      const d = record.uploadedAt;
      const date = d ? d.toISOString().slice(0, 10) : '';
      const time = d ? d.toISOString().slice(11, 19) : '';
      const downloadUrl = await this.s3.getPresignedDownloadUrl(s3Key);
      results.push({
        id: record.id,
        fileName: record.fileName,
        type: record.type,
        format: record.format,
        date,
        time,
        downloadUrl,
      });
    }
    return results;
  }

  async list(currentUser: User): Promise<UploadedFileResponse[]> {
    const clientId = await this.getClientId(currentUser);
    const files = await this.repo.find({
      where: { clientId },
      order: { uploadedAt: 'DESC' },
    });
    const results: UploadedFileResponse[] = [];
    for (const f of files) {
      const d = f.uploadedAt;
      let previewUrl: string | undefined;
      try {
        previewUrl = await this.s3.getPresignedDownloadUrl(f.s3Key);
      } catch {
        previewUrl = undefined;
      }
      results.push({
        id: f.id,
        fileName: f.fileName,
        type: f.type,
        format: f.format,
        date: d ? d.toISOString().slice(0, 10) : '',
        time: d ? d.toISOString().slice(11, 19) : '',
        previewUrl,
        viewUrl: previewUrl,
      });
    }
    return results;
  }

  async getDownloadUrl(fileId: number, currentUser: User): Promise<{ downloadUrl: string }> {
    const file = await this.repo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    if (currentUser.role?.name === RoleName.CLIENT) {
      const myClientId = await this.getClientId(currentUser);
      if (file.clientId !== myClientId) throw new ForbiddenException('File not found');
    } else if (ORG_ROLES.includes(currentUser.role?.name as RoleName)) {
      const canAccess = await this.canAccessClient(currentUser, file.clientId);
      if (!canAccess) throw new ForbiddenException('Access denied to this client');
    } else {
      throw new ForbiddenException('Access denied');
    }
    const downloadUrl = await this.s3.getPresignedDownloadUrl(file.s3Key);
    return { downloadUrl };
  }

  /** Org users: list uploaded files for a client that belongs to their organization. */
  async listByClient(clientId: number, currentUser: User): Promise<UploadedFileResponse[]> {
    if (!ORG_ROLES.includes(currentUser.role?.name as RoleName)) {
      throw new ForbiddenException('Only org users can list client files');
    }
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');
    const canAccess = await this.canAccessClient(currentUser, clientId);
    if (!canAccess) throw new ForbiddenException('Access denied to this client');
    const files = await this.repo.find({
      where: { clientId },
      order: { uploadedAt: 'DESC' },
    });
    const results: UploadedFileResponse[] = [];
    for (const f of files) {
      const d = f.uploadedAt;
      let previewUrl: string | undefined;
      try {
        previewUrl = await this.s3.getPresignedDownloadUrl(f.s3Key);
      } catch {
        previewUrl = undefined;
      }
      results.push({
        id: f.id,
        fileName: f.fileName,
        type: f.type,
        format: f.format,
        date: d ? d.toISOString().slice(0, 10) : '',
        time: d ? d.toISOString().slice(11, 19) : '',
        previewUrl,
        viewUrl: previewUrl,
      });
    }
    return results;
  }

  private async canAccessClient(currentUser: User, clientId: number): Promise<boolean> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) return false;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) return true;
    return currentUser.organizationId === client.organizationId;
  }
}
