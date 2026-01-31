import { TemplateCategory } from './template-category.enum';

export const TEMPLATE_TYPES_BY_CATEGORY: Record<TemplateCategory, Record<string, string>> = {
  [TemplateCategory.SERVICE]: {
    gst_filing: 'GST Filing',
    income_tax_return: 'Income Tax Return',
    tds: 'TDS',
    audit: 'Audit',
    roc_filing: 'ROC Filing',
    pf_esic: 'PF / ESIC',
    accounting: 'Accounting',
    book_keeping: 'Book Keeping',
    company_registration: 'Company Registration',
    llp_registration: 'LLP Registration',
    trademark: 'Trademark',
    iso_certification: 'ISO Certification',
    labour_compliance: 'Labour Compliance',
    custom_service: 'Custom Service',
  },
  [TemplateCategory.LOGIN]: {
    login_credentials: 'Login Credentials',
    password_reset: 'Password Reset',
    welcome_email: 'Welcome Email',
  },
  [TemplateCategory.NOTIFICATION]: {
    client_onboarded: 'Client Onboarded',
    service_assigned: 'Service Assigned',
    document_uploaded: 'Document Uploaded',
    payment_received: 'Payment Received',
  },
  [TemplateCategory.FOLLOW_UP]: {
    follow_up_documents: 'Follow-up Documents',
    follow_up_payment: 'Follow-up Payment',
    follow_up_meeting: 'Follow-up Meeting',
  },
  [TemplateCategory.REMINDER]: {
    reminder_deadline: 'Reminder Deadline',
    reminder_submission: 'Reminder Submission',
    reminder_renewal: 'Reminder Renewal',
  },
};

/** All valid template type keys (e.g. 'gst_filing', 'login_credentials'). */
export type TemplateType = string;
