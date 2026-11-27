/**
 * Lookup keys shared between automation and the modules that send mail. Kept in a file with no imports
 * so that automation never imports the developer or leads modules (which import automation).
 */

/** The tracked send path (DeveloperService.sendTransactional). Provided by DeveloperModule. */
export const CRM_MAIL_SENDER = Symbol('CRM_MAIL_SENDER');

export interface CrmMailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: number | string;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface CrmMailSender {
  sendTransactional(
    orgId: number,
    apiKeyId: number | null,
    dto: CrmMailMessage,
    businessUnitId: number | null,
    crm?: { leadId: number; sequenceId?: number },
  ): Promise<{ id: string; status: string; error?: string }>;
}
