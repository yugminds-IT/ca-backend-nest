// Per-client values ({{client_name}}, and each industry's own like {{student_name}}) for emails the server
// sends to a segment. Mirrors CA-Automations-Frontend: clientVariables() in send-mails-utils.ts and
// resolveClientVars in lib/industry-config.ts. Change both together.
import type { Client } from '../entities/client.entity';

export interface Sender {
  orgName: string;
  orgAddress?: string;
  /** The person sending (shown as the doctor when a patient has none) */
  userName?: string;
  /** Frontend origin, e.g. https://app.lekvya.com (no trailing slash) */
  appUrl: string;
}

/** "15 December 2026", the format the app shows dates in. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

type Flat = {
  id: number; name: string; email: string; phone: string; companyName: string; businessType: string; city: string;
  panNumber: string; additionalNotes: string; address: string; followUpDate: string;
  services: { name: string }[]; directors: { name: string; designation?: string }[];
};

const INDUSTRY: Record<string, (c: Flat, s: Sender) => Record<string, string>> = {
  website_developer: (c) => ({
    sender_name: c.name, sender_email: c.email, sender_phone: c.phone, company: c.companyName,
    page_url: c.address || c.city, message: c.additionalNotes,
  }),
  school: (c, s) => schoolLike(c, s),
  education: (c, s) => schoolLike(c, s),
  ecommerce: (c) => ({
    customer_name: c.name, order_id: c.panNumber || String(c.id), order_total: c.additionalNotes, tracking_url: '',
    items_summary: c.services.map((x) => x.name).join(', '),
  }),
  healthcare: (c, s) => ({
    patient_name: c.name, doctor_name: c.directors[0]?.name || s.userName || '', appointment_date: c.followUpDate,
    appointment_time: '', clinic_address: s.orgAddress ?? '', report_link: '',
  }),
  saas: (c, s) => ({
    user_name: c.name, app_name: s.orgName, trial_days_left: '', login_url: `${s.appUrl}/login`, plan_name: c.businessType,
  }),
  financial_services: (c) => ({
    client_name: c.name, company_name: c.companyName, due_date: c.followUpDate, service_name: c.services[0]?.name ?? '',
  }),
};

function schoolLike(c: Flat, s: Sender): Record<string, string> {
  return {
    student_name: c.name,
    parent_name: c.directors[0]?.name || (c.name ? `Parent of ${c.name}` : ''),
    grade_class: c.businessType,
    roll_number: c.panNumber || String(c.id),
    fee_amount: c.additionalNotes,
    due_date: c.followUpDate,
    institution_name: s.orgName,
    recipient_name: c.name,
    department: c.city,
    designation: c.directors[0]?.designation ?? '',
    meeting_datetime: c.followUpDate,
    meeting_venue: s.orgAddress ?? '',
    portal_url: s.appUrl,
  };
}

/** Every value built from the client record; the industry's values only fill gaps in the built-in ones. */
export function clientVariables(client: Client, industry: string | null | undefined, sender: Sender): Record<string, string> {
  const services = (client.services ?? []).filter((x) => x.name).map((x) => ({ name: x.name }));
  const c: Flat = {
    id: client.id,
    name: client.name ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    companyName: client.companyName ?? '',
    businessType: client.businessType?.name ?? '',
    city: client.city ?? '',
    panNumber: client.panNumber ?? '',
    additionalNotes: client.additionalNotes ?? '',
    address: client.address ?? '',
    followUpDate: formatDay(client.followupDate),
    services,
    directors: (client.directors ?? []).filter((d) => d.directorName).map((d) => ({ name: d.directorName, designation: d.designation ?? undefined })),
  };
  const base: Record<string, string> = {
    client_name: c.name,
    client_email: c.email,
    client_phone: c.phone,
    company_name: c.companyName,
    client_city: c.city,
    pan_number: c.panNumber,
    gst_number: client.gstNumber ?? '',
    service_name: services[0]?.name ?? '',
    service_description: '', // services have no description on the server (blank in the app too)
    follow_up_date: c.followUpDate,
    onboard_date: formatDay(client.onboardDate),
    additional_notes: c.additionalNotes,
  };
  const key = (industry ?? '').toLowerCase().trim();
  const extra = (INDUSTRY[key] ?? INDUSTRY.financial_services)(c, sender);
  for (const [k, v] of Object.entries(extra)) if (v || !(k in base)) base[k] = v ?? '';
  return base;
}
