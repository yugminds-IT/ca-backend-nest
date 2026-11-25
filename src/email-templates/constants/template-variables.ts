/**
 * Single source of truth for template variables. Served at GET /email-templates/variables and used
 * by every editor/picker in the frontend.
 *
 * `source` says who fills the value:
 * - client: the sender's browser, from the client record (one value per recipient)
 * - org:    the server, from the sending organization
 * - system: the server, from the current date (or config)
 * - login:  the server, from the recipient client's portal login
 * - send:   the person sending types it once for that send (also used for any unknown {{custom}} variable)
 */
export type VariableSource = 'client' | 'org' | 'system' | 'login' | 'send';

export interface TemplateVariable {
  key: string;
  label: string;
  group: string;
  source: VariableSource;
  example: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: '{{client_name}}', label: 'Client Name', group: 'Client', source: 'client', example: 'Asha Rao' },
  { key: '{{client_email}}', label: 'Client Email', group: 'Client', source: 'client', example: 'asha@example.com' },
  { key: '{{client_phone}}', label: 'Client Phone', group: 'Client', source: 'client', example: '+91 98765 43210' },
  { key: '{{company_name}}', label: 'Company Name', group: 'Client', source: 'client', example: 'Rao Traders Pvt Ltd' },
  { key: '{{client_city}}', label: 'Client City', group: 'Client', source: 'client', example: 'Mumbai' },
  { key: '{{pan_number}}', label: 'PAN Number', group: 'Client', source: 'client', example: 'ABCDE1234F' },
  { key: '{{gst_number}}', label: 'GST Number', group: 'Client', source: 'client', example: '27ABCDE1234F1Z5' },
  { key: '{{service_name}}', label: 'Service Name', group: 'Client', source: 'client', example: 'GST Filing' },
  { key: '{{service_description}}', label: 'Service Description', group: 'Client', source: 'client', example: 'Monthly GST return filing' },
  { key: '{{follow_up_date}}', label: 'Follow-up Date', group: 'Client', source: 'client', example: '15 December 2026' },
  { key: '{{onboard_date}}', label: 'Onboard Date', group: 'Client', source: 'client', example: '1 April 2026' },
  { key: '{{additional_notes}}', label: 'Additional Notes', group: 'Client', source: 'client', example: 'Prefers WhatsApp' },

  { key: '{{org_name}}', label: 'Organization Name', group: 'Organization', source: 'org', example: 'Your Firm LLP' },
  { key: '{{org_admin_name}}', label: 'Sender Name', group: 'Organization', source: 'org', example: 'Ravi Kumar' },
  { key: '{{org_email}}', label: 'Organization Email', group: 'Organization', source: 'org', example: 'office@yourfirm.com' },
  { key: '{{org_phone}}', label: 'Organization Phone', group: 'Organization', source: 'org', example: '+91 90000 00000' },

  { key: '{{login_email}}', label: 'Login Email', group: 'Portal Login', source: 'login', example: 'asha@example.com' },
  { key: '{{login_password}}', label: 'Login Password', group: 'Portal Login', source: 'login', example: '••••••••' },
  { key: '{{login_url}}', label: 'Login URL', group: 'Portal Login', source: 'login', example: 'https://portal.example.com/login' },

  { key: '{{today}}', label: 'Today', group: 'Dates', source: 'system', example: '22 November 2026' },
  { key: '{{current_date}}', label: 'Current Date', group: 'Dates', source: 'system', example: '22 November 2026' },
  { key: '{{date}}', label: 'Date', group: 'Dates', source: 'system', example: '22 November 2026' },
  { key: '{{financial_year}}', label: 'Financial Year', group: 'Dates', source: 'system', example: '2026-27' },
  { key: '{{assessment_year}}', label: 'Assessment Year', group: 'Dates', source: 'system', example: '2027-28' },

  { key: '{{deadline_date}}', label: 'Deadline Date', group: 'Asked when sending', source: 'send', example: '31 December 2026' },
  { key: '{{amount}}', label: 'Amount', group: 'Asked when sending', source: 'send', example: '₹5,000' },
  { key: '{{document_name}}', label: 'Document Name', group: 'Asked when sending', source: 'send', example: 'Form 16' },
];
