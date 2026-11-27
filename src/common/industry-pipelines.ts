/**
 * Starter pipeline stages for each industry. Copied into the industry_templates table by the migration,
 * after which master admins can edit them there. Each list is the open stages in order; the won and lost stages are added by the service.
 */
export interface IndustryStageSeed {
  name: string;
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}

function stagesFor(open: string[], wonName: string): IndustryStageSeed[] {
  const step = Math.floor(70 / Math.max(open.length, 1));
  return [
    ...open.map((name, i) => ({ name, probability: Math.min(10 + i * step, 80) })),
    { name: wonName, probability: 100, isWon: true },
    { name: 'Lost', probability: 0, isLost: true },
  ];
}

export const INDUSTRY_PIPELINE_STAGES: Record<string, IndustryStageSeed[]> = {
  school: stagesFor(['New enquiry', 'Counselling', 'Campus visit', 'Application submitted'], 'Admission confirmed'),
  education: stagesFor(['New enquiry', 'Demo booked', 'Demo attended', 'Fee discussion'], 'Enrolled'),
  website_developer: stagesFor(['New enquiry', 'Discovery call', 'Proposal sent', 'Negotiation'], 'Signed'),
  ecommerce: stagesFor(['New lead', 'Interested', 'Trial or sample', 'Order pending'], 'Ordered'),
  healthcare: stagesFor(['New enquiry', 'Appointment requested', 'Consultation scheduled', 'Treatment plan'], 'Patient onboarded'),
  saas: stagesFor(['New lead', 'Qualified', 'Demo scheduled', 'Trial', 'Proposal'], 'Closed won'),
  financial_services: stagesFor(['New enquiry', 'Documents requested', 'Under review', 'Quote shared'], 'Onboarded'),
  custom: stagesFor(['New', 'Contacted', 'Qualified', 'Proposal'], 'Won'),
};
