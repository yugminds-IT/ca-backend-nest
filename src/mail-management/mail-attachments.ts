import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

/** A file uploaded for a mail send, stored in S3 and referenced by key. */
export interface AttachmentRef {
  key: string;
  name: string;
  size: number;
  contentType: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Per email (shared + that recipient's own files); most providers reject messages over ~25 MB. */
export const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|txt|pptx?|zip)$/i;

/** S3 folder for an org's mail attachments; master admins use "master". */
export const attachmentPrefix = (organizationId: number | null | undefined) =>
  `mail-attachments/${organizationId ?? 'master'}/`;

export function attachmentKey(organizationId: number | null | undefined, fileName: string): string {
  const safe = fileName.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file';
  return `${attachmentPrefix(organizationId)}${randomUUID()}/${safe}`;
}

export function checkUpload(file: { originalname?: string; size?: number } | undefined) {
  if (!file) throw new BadRequestException('No file uploaded');
  if (!ALLOWED.test(file.originalname ?? '')) {
    throw new BadRequestException('This file type cannot be attached. Use PDF, Word, Excel, CSV, PowerPoint, images, text or ZIP.');
  }
  if ((file.size ?? 0) > MAX_FILE_BYTES) throw new BadRequestException('Files can be up to 10 MB each.');
}

/**
 * Every referenced file must belong to the sender's organization (keys can't be borrowed from
 * another org), and no single email may carry more than MAX_EMAIL_ATTACHMENT_BYTES.
 */
export function checkAttachmentRefs(
  shared: AttachmentRef[],
  perRecipient: Record<string, AttachmentRef[]>,
  organizationId: number | null | undefined,
  isMasterAdmin: boolean,
) {
  const prefix = attachmentPrefix(organizationId);
  const all = [...shared, ...Object.values(perRecipient).flat()];
  for (const a of all) {
    if (!a.key.startsWith('mail-attachments/') || a.key.includes('..')) throw new BadRequestException(`Unknown attachment: ${a.name}`);
    if (!isMasterAdmin && !a.key.startsWith(prefix)) throw new BadRequestException(`Unknown attachment: ${a.name}`);
  }
  const sharedBytes = shared.reduce((n, a) => n + a.size, 0);
  const emails = Object.keys(perRecipient);
  const worst = Math.max(sharedBytes, ...emails.map((e) => sharedBytes + perRecipient[e].reduce((n, a) => n + a.size, 0)));
  if (worst > MAX_EMAIL_ATTACHMENT_BYTES) {
    throw new BadRequestException(`Attachments add up to ${(worst / 1024 / 1024).toFixed(1)} MB for one email; the limit is 20 MB.`);
  }
}
