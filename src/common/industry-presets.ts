export interface IndustryTemplatePreset {
  category: string;
  type: string;
  name: string;
  subject: string;
  body: string;
}

export interface IndustryDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  starterTemplates: IndustryTemplatePreset[];
  variables: { key: string; label: string; example: string }[];
}

export const INDUSTRY_PRESETS: Record<string, IndustryDefinition> = {
  school: {
    key: 'school',
    name: 'Educational Institutions & Academies',
    description: 'All institutions: Schools, Colleges, Universities & Coaching. Student, parent, faculty, lecturer & director communications.',
    icon: 'GraduationCap',
    variables: [
      { key: 'recipient_name', label: 'Recipient Name', example: 'Dr. Ramesh Rao / Mrs. Sharma' },
      { key: 'recipient_role', label: 'Recipient Role', example: 'Student / Parent / Lecturer / HOD / Director' },
      { key: 'institution_name', label: 'Institution Name', example: 'Apex Institute of Technology' },
      { key: 'department', label: 'Department / Branch', example: 'Computer Science & Engineering' },
      { key: 'designation', label: 'Designation', example: 'Senior Lecturer / Professor / Dean' },
      { key: 'student_name', label: 'Student Name', example: 'Aarav Sharma' },
      { key: 'parent_name', label: 'Parent / Guardian Name', example: 'Mrs. Sunita Sharma' },
      { key: 'grade_class', label: 'Class / Semester / Batch', example: 'B.Tech 3rd Year - Sem VI' },
      { key: 'roll_number', label: 'Roll / Registration Number', example: '21CS1048' },
      { key: 'fee_amount', label: 'Fee / Dues Amount', example: '₹45,000' },
      { key: 'due_date', label: 'Due / Deadline Date', example: '15th Nov 2026' },
      { key: 'meeting_datetime', label: 'Meeting Date & Time', example: 'Monday, 20th Oct at 10:30 AM' },
      { key: 'meeting_venue', label: 'Meeting Venue / Room', example: 'Board Room 1 / Zoom' },
      { key: 'portal_url', label: 'Campus Portal URL', example: 'https://campus.institute.edu' },
    ],
    starterTemplates: [
      {
        category: 'reminder',
        type: 'fee_due_reminder',
        name: 'Tuition & Semester Fee Payment Reminder',
        subject: 'Important: Semester / Tuition Fee Payment Due for {{student_name}} - {{institution_name}}',
        body: `<p>Dear {{parent_name}},</p>
<p>This is a reminder from the Accounts & Finance Office of <strong>{{institution_name}}</strong> regarding the fee payment for <strong>{{student_name}}</strong> ({{grade_class}}, Roll No: <strong>{{roll_number}}</strong>).</p>
<p>Total Due Amount: <strong>{{fee_amount}}</strong><br/>
Last Date for Payment: <strong>{{due_date}}</strong></p>
<p>You can make the payment online through the student portal: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>If payment has already been remitted, kindly upload the transaction receipt or ignore this notification.</p>
<p>Warm regards,<br/>Accounts Department<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'exam_schedule_notice',
        name: 'Exam Schedule & Hall Ticket Release',
        subject: 'Notice: Semester / Term Examination Schedule Released - {{grade_class}}',
        body: `<p>Dear {{recipient_name}},</p>
<p>The examination schedule for <strong>{{grade_class}}</strong> at <strong>{{institution_name}}</strong> has been finalized and published.</p>
<p>Hall tickets and seating allocations are available for download on the student portal: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>Please note that carrying your institutional ID card and hall ticket is mandatory for all examination sessions.</p>
<p>Best regards,<br/>Controller of Examinations<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'faculty_meeting_notice',
        name: 'Internal: Faculty, Lecturers & HOD Council Meeting',
        subject: 'Faculty Council Notice: Academic Review Meeting with Director on {{meeting_datetime}}',
        body: `<p>Dear {{designation}} {{recipient_name}},</p>
<p>Notice is hereby given for the upcoming <strong>Academic & Faculty Council Meeting</strong> of <strong>{{department}}</strong> with the Director and Deans.</p>
<ul>
  <li><strong>Date & Time:</strong> {{meeting_datetime}}</li>
  <li><strong>Venue:</strong> {{meeting_venue}}</li>
  <li><strong>Agenda:</strong>
    <ol>
      <li>Semester syllabus progress & mid-term assessment review</li>
      <li>Upcoming examination duty and invigilation assignments</li>
      <li>Accreditation, laboratory maintenance, and research submissions</li>
    </ol>
  </li>
</ul>
<p>All Department Heads, Professors, and Lecturers are requested to attend promptly with their respective course files.</p>
<p>By order,<br/>Office of the Director<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'exam_duty_allocation',
        name: 'Internal: Exam Duty & Invigilation Roster Allocation',
        subject: 'Duty Allocation: Examination Invigilation Roster for {{recipient_name}}',
        body: `<p>Dear {{recipient_name}} ({{department}}),</p>
<p>Please find below your assigned examination duty and invigilation schedule for the upcoming examinations at <strong>{{institution_name}}</strong>.</p>
<p>You are requested to report to the Examination Control Room at least 30 minutes prior to the commencement of the exam. If you require a duty exchange due to medical or emergency reasons, please submit a written request endorsed by your HOD 48 hours in advance.</p>
<p>Detailed invigilation guidelines: <a href="{{portal_url}}">{{portal_url}}</a></p>
<p>Regards,<br/>Chief Superintendent / Dean of Examinations<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'director_circular_internal',
        name: 'Internal: Official Circular from Director’s Desk',
        subject: 'Institutional Circular: Important Academic & Administrative Directive - {{institution_name}}',
        body: `<p>To: All Deans, HODs, Lecturers, Teaching & Administrative Staff,</p>
<p><strong>Subject: Directive from the Director’s Office</strong></p>
<p>Please be advised of the updated institutional guidelines regarding campus timings, academic delivery, and student attendance compliance effective from next week.</p>
<p>All Department Heads are instructed to circulate this among your respective faculty members and ensure strict compliance.</p>
<p>For full circular copy and attachments, visit: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>Sincerely,<br/>Director / Principal<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'campus_placement_alert',
        name: 'Student: Campus Placement & Internship Drive',
        subject: 'Campus Placement Alert: Recruitment Drive for {{grade_class}}',
        body: `<p>Dear {{student_name}},</p>
<p>The Training & Placement Cell of <strong>{{institution_name}}</strong> is pleased to announce an upcoming campus recruitment drive for students of <strong>{{grade_class}}</strong>.</p>
<p>Eligible students with no active backlogs are required to register their updated resumes on the portal before <strong>{{due_date}}</strong>.</p>
<p>Registration link: <a href="{{portal_url}}">{{portal_url}}</a></p>
<p>Best of luck!<br/>Training & Placement Officer<br/>{{institution_name}}</p>`,
      },
    ],
  },
  education: {
    // Alias to school for backward compatibility
    key: 'education',
    name: 'Educational Institutions & Academies',
    description: 'All institutions: Schools, Colleges, Universities & Coaching. Student, parent, faculty, lecturer & director communications.',
    icon: 'GraduationCap',
    variables: [
      { key: 'recipient_name', label: 'Recipient Name', example: 'Dr. Ramesh Rao / Mrs. Sharma' },
      { key: 'recipient_role', label: 'Recipient Role', example: 'Student / Parent / Lecturer / HOD / Director' },
      { key: 'institution_name', label: 'Institution Name', example: 'Apex Institute of Technology' },
      { key: 'department', label: 'Department / Branch', example: 'Computer Science & Engineering' },
      { key: 'designation', label: 'Designation', example: 'Senior Lecturer / Professor / Dean' },
      { key: 'student_name', label: 'Student Name', example: 'Aarav Sharma' },
      { key: 'parent_name', label: 'Parent / Guardian Name', example: 'Mrs. Sunita Sharma' },
      { key: 'grade_class', label: 'Class / Semester / Batch', example: 'B.Tech 3rd Year - Sem VI' },
      { key: 'roll_number', label: 'Roll / Registration Number', example: '21CS1048' },
      { key: 'fee_amount', label: 'Fee / Dues Amount', example: '₹45,000' },
      { key: 'due_date', label: 'Due / Deadline Date', example: '15th Nov 2026' },
      { key: 'meeting_datetime', label: 'Meeting Date & Time', example: 'Monday, 20th Oct at 10:30 AM' },
      { key: 'meeting_venue', label: 'Meeting Venue / Room', example: 'Board Room 1 / Zoom' },
      { key: 'portal_url', label: 'Campus Portal URL', example: 'https://campus.institute.edu' },
    ],
    starterTemplates: [
      {
        category: 'reminder',
        type: 'fee_due_reminder',
        name: 'Tuition & Semester Fee Payment Reminder',
        subject: 'Important: Semester / Tuition Fee Payment Due for {{student_name}} - {{institution_name}}',
        body: `<p>Dear {{parent_name}},</p>
<p>This is a reminder from the Accounts & Finance Office of <strong>{{institution_name}}</strong> regarding the fee payment for <strong>{{student_name}}</strong> ({{grade_class}}, Roll No: <strong>{{roll_number}}</strong>).</p>
<p>Total Due Amount: <strong>{{fee_amount}}</strong><br/>
Last Date for Payment: <strong>{{due_date}}</strong></p>
<p>You can make the payment online through the student portal: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>If payment has already been remitted, kindly upload the transaction receipt or ignore this notification.</p>
<p>Warm regards,<br/>Accounts Department<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'exam_schedule_notice',
        name: 'Exam Schedule & Hall Ticket Release',
        subject: 'Notice: Semester / Term Examination Schedule Released - {{grade_class}}',
        body: `<p>Dear {{recipient_name}},</p>
<p>The examination schedule for <strong>{{grade_class}}</strong> at <strong>{{institution_name}}</strong> has been finalized and published.</p>
<p>Hall tickets and seating allocations are available for download on the student portal: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>Please note that carrying your institutional ID card and hall ticket is mandatory for all examination sessions.</p>
<p>Best regards,<br/>Controller of Examinations<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'faculty_meeting_notice',
        name: 'Internal: Faculty, Lecturers & HOD Council Meeting',
        subject: 'Faculty Council Notice: Academic Review Meeting with Director on {{meeting_datetime}}',
        body: `<p>Dear {{designation}} {{recipient_name}},</p>
<p>Notice is hereby given for the upcoming <strong>Academic & Faculty Council Meeting</strong> of <strong>{{department}}</strong> with the Director and Deans.</p>
<ul>
  <li><strong>Date & Time:</strong> {{meeting_datetime}}</li>
  <li><strong>Venue:</strong> {{meeting_venue}}</li>
  <li><strong>Agenda:</strong>
    <ol>
      <li>Semester syllabus progress & mid-term assessment review</li>
      <li>Upcoming examination duty and invigilation assignments</li>
      <li>Accreditation, laboratory maintenance, and research submissions</li>
    </ol>
  </li>
</ul>
<p>All Department Heads, Professors, and Lecturers are requested to attend promptly with their respective course files.</p>
<p>By order,<br/>Office of the Director<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'exam_duty_allocation',
        name: 'Internal: Exam Duty & Invigilation Roster Allocation',
        subject: 'Duty Allocation: Examination Invigilation Roster for {{recipient_name}}',
        body: `<p>Dear {{recipient_name}} ({{department}}),</p>
<p>Please find below your assigned examination duty and invigilation schedule for the upcoming examinations at <strong>{{institution_name}}</strong>.</p>
<p>You are requested to report to the Examination Control Room at least 30 minutes prior to the commencement of the exam. If you require a duty exchange due to medical or emergency reasons, please submit a written request endorsed by your HOD 48 hours in advance.</p>
<p>Detailed invigilation guidelines: <a href="{{portal_url}}">{{portal_url}}</a></p>
<p>Regards,<br/>Chief Superintendent / Dean of Examinations<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'director_circular_internal',
        name: 'Internal: Official Circular from Director’s Desk',
        subject: 'Institutional Circular: Important Academic & Administrative Directive - {{institution_name}}',
        body: `<p>To: All Deans, HODs, Lecturers, Teaching & Administrative Staff,</p>
<p><strong>Subject: Directive from the Director’s Office</strong></p>
<p>Please be advised of the updated institutional guidelines regarding campus timings, academic delivery, and student attendance compliance effective from next week.</p>
<p>All Department Heads are instructed to circulate this among your respective faculty members and ensure strict compliance.</p>
<p>For full circular copy and attachments, visit: <a href="{{portal_url}}">{{portal_url}}</a>.</p>
<p>Sincerely,<br/>Director / Principal<br/>{{institution_name}}</p>`,
      },
      {
        category: 'notification',
        type: 'campus_placement_alert',
        name: 'Student: Campus Placement & Internship Drive',
        subject: 'Campus Placement Alert: Recruitment Drive for {{grade_class}}',
        body: `<p>Dear {{student_name}},</p>
<p>The Training & Placement Cell of <strong>{{institution_name}}</strong> is pleased to announce an upcoming campus recruitment drive for students of <strong>{{grade_class}}</strong>.</p>
<p>Eligible students with no active backlogs are required to register their updated resumes on the portal before <strong>{{due_date}}</strong>.</p>
<p>Registration link: <a href="{{portal_url}}">{{portal_url}}</a></p>
<p>Best of luck!<br/>Training & Placement Officer<br/>{{institution_name}}</p>`,
      },
    ],
  },

  website_developer: {
    key: 'website_developer',
    name: 'Websites & Developers',
    description: 'Contact form submissions, lead generation, transactional API, auto-responders (EmailJS / Resend style)',
    icon: 'Globe',
    variables: [
      { key: 'sender_name', label: 'Sender Name', example: 'John Doe' },
      { key: 'sender_email', label: 'Sender Email', example: 'john@example.com' },
      { key: 'sender_phone', label: 'Sender Phone', example: '+1 (555) 234-5678' },
      { key: 'message', label: 'Message Body', example: 'I am interested in your services...' },
      { key: 'company', label: 'Company / Org', example: 'Acme Corp' },
      { key: 'page_url', label: 'Origin Page URL', example: 'https://mysite.com/contact' },
    ],
    starterTemplates: [
      {
        category: 'notification',
        type: 'contact_form_inquiry',
        name: 'Website Contact Form Notification',
        subject: 'New Website Inquiry from {{sender_name}} ({{company}})',
        body: `<h2>New Contact Form Inquiry</h2>
<p><strong>Name:</strong> {{sender_name}}</p>
<p><strong>Email:</strong> <a href="mailto:{{sender_email}}">{{sender_email}}</a></p>
<p><strong>Phone:</strong> {{sender_phone}}</p>
<p><strong>Company:</strong> {{company}}</p>
<p><strong>Page Source:</strong> {{page_url}}</p>
<hr/>
<p><strong>Message:</strong></p>
<blockquote style="background:#f4f4f4;padding:12px;border-left:4px solid #6366f1;">
{{message}}
</blockquote>`,
      },
      {
        category: 'notification',
        type: 'contact_auto_responder',
        name: 'Contact Form Auto-Responder to Visitor',
        subject: 'Thank you for reaching out, {{sender_name}}! We received your message.',
        body: `<p>Hi {{sender_name}},</p>
<p>Thank you for getting in touch with us! We have received your inquiry and our team is already reviewing it.</p>
<p>We typically respond within 24 hours on business days. If your inquiry is urgent, please feel free to give us a call.</p>
<p>Here is a copy of your message for your records:</p>
<blockquote style="background:#f9f9f9;padding:10px;border-left:3px solid #ccc;">
{{message}}
</blockquote>
<p>Best regards,<br/>The Support Team</p>`,
      },
    ],
  },

  ecommerce: {
    key: 'ecommerce',
    name: 'E-Commerce & Retail',
    description: 'Order confirmations, shipment tracking, abandoned cart nudges, receipts',
    icon: 'ShoppingCart',
    variables: [
      { key: 'customer_name', label: 'Customer Name', example: 'Sarah Jenkins' },
      { key: 'order_id', label: 'Order ID', example: '#ORD-9841' },
      { key: 'order_total', label: 'Order Total', example: '$129.50' },
      { key: 'tracking_url', label: 'Tracking URL', example: 'https://track.carrier.com/123' },
      { key: 'items_summary', label: 'Items Summary', example: '2x Organic Cotton T-Shirt' },
    ],
    starterTemplates: [
      {
        category: 'notification',
        type: 'order_confirmation',
        name: 'Order Confirmation & Receipt',
        subject: 'Order Confirmed: {{order_id}} - Thank you for shopping with us!',
        body: `<p>Hi {{customer_name}},</p>
<p>Great news! Your order <strong>{{order_id}}</strong> has been confirmed and is being prepared for dispatch.</p>
<p><strong>Order Summary:</strong><br/>{{items_summary}}</p>
<p><strong>Total Paid:</strong> {{order_total}}</p>
<p>We will email you again with your tracking details as soon as your package ships.</p>
<p>Thank you for choosing us!</p>`,
      },
      {
        category: 'notification',
        type: 'shipping_update',
        name: 'Shipment Tracking Alert',
        subject: 'Your order {{order_id}} is on the way! 🚚',
        body: `<p>Hi {{customer_name}},</p>
<p>Your order <strong>{{order_id}}</strong> has shipped!</p>
<p><a href="{{tracking_url}}" style="display:inline-block;padding:10px 18px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Track Your Shipment</a></p>
<p>Tracking link: <a href="{{tracking_url}}">{{tracking_url}}</a></p>`,
      },
    ],
  },

  healthcare: {
    key: 'healthcare',
    name: 'Healthcare & Clinics',
    description: 'Appointment reminders, intake confirmation, lab report readiness, follow-up care',
    icon: 'HeartPulse',
    variables: [
      { key: 'patient_name', label: 'Patient Name', example: 'Robert Chen' },
      { key: 'doctor_name', label: 'Doctor / Specialist', example: 'Dr. Emily Vance' },
      { key: 'appointment_date', label: 'Appointment Date', example: 'Wednesday, Oct 28' },
      { key: 'appointment_time', label: 'Appointment Time', example: '10:30 AM' },
      { key: 'clinic_address', label: 'Clinic Address', example: 'Suite 402, Medical Arts Bldg' },
      { key: 'report_link', label: 'Report Download Link', example: 'https://clinic.health/reports/99' },
    ],
    starterTemplates: [
      {
        category: 'reminder',
        type: 'appointment_reminder_24h',
        name: '24-Hour Appointment Reminder',
        subject: 'Appointment Reminder: {{doctor_name}} on {{appointment_date}} at {{appointment_time}}',
        body: `<p>Dear {{patient_name}},</p>
<p>This is a reminder of your upcoming consultation with <strong>{{doctor_name}}</strong>:</p>
<ul>
  <li><strong>Date:</strong> {{appointment_date}}</li>
  <li><strong>Time:</strong> {{appointment_time}}</li>
  <li><strong>Location:</strong> {{clinic_address}}</li>
</ul>
<p>Please arrive 10 minutes prior with your ID and any relevant medical records. If you need to reschedule, please let us know at least 24 hours in advance.</p>`,
      },
      {
        category: 'notification',
        type: 'lab_report_ready',
        name: 'Lab Report / Test Results Ready',
        subject: 'Your Test Results are Now Available - Patient Portal',
        body: `<p>Dear {{patient_name}},</p>
<p>Your recent laboratory test results ordered by {{doctor_name}} are now ready for review.</p>
<p>You can securely view and download your report from the patient portal: <a href="{{report_link}}">{{report_link}}</a>.</p>
<p>If you have any questions or require a follow-up consultation, our clinic desk is here to help.</p>`,
      },
    ],
  },

  saas: {
    key: 'saas',
    name: 'SaaS & Tech Startups',
    description: 'User onboarding drips, magic login links, trial alerts, subscription invoices',
    icon: 'Rocket',
    variables: [
      { key: 'user_name', label: 'User Name', example: 'Alex Morgan' },
      { key: 'app_name', label: 'App / Platform Name', example: 'CloudFlow' },
      { key: 'trial_days_left', label: 'Days Left in Trial', example: '3' },
      { key: 'login_url', label: 'Login / Magic URL', example: 'https://app.cloudflow.io/login' },
      { key: 'plan_name', label: 'Plan Name', example: 'Pro Tier' },
    ],
    starterTemplates: [
      {
        category: 'notification',
        type: 'welcome_onboarding',
        name: 'Welcome to App - Getting Started',
        subject: 'Welcome to {{app_name}}! Here are 3 quick steps to get started 🚀',
        body: `<p>Hi {{user_name}},</p>
<p>Welcome to <strong>{{app_name}}</strong>! We are thrilled to have you on board.</p>
<p>Here is how you can get up and running in under 2 minutes:</p>
<ol>
  <li>Log into your workspace: <a href="{{login_url}}">{{login_url}}</a></li>
  <li>Invite your team members</li>
  <li>Generate your first API key or connect your domain</li>
</ol>
<p>If you have any questions, simply reply directly to this email.</p>`,
      },
      {
        category: 'reminder',
        type: 'trial_ending_notice',
        name: 'Trial Expiring Notice',
        subject: 'Your {{app_name}} trial ends in {{trial_days_left}} days',
        body: `<p>Hi {{user_name}},</p>
<p>Your free trial of {{app_name}} {{plan_name}} will conclude in <strong>{{trial_days_left}} days</strong>.</p>
<p>To avoid any interruption in your automated email pipelines and API access, choose your plan here: <a href="{{login_url}}">{{login_url}}</a>.</p>`,
      },
    ],
  },

  financial_services: {
    key: 'financial_services',
    name: 'CA & Financial Services',
    description: 'GST filing deadlines, TDS return reminders, document collection, tax audit alerts',
    icon: 'Calculator',
    variables: [
      { key: 'client_name', label: 'Client / Company Name', example: 'Apex Technologies Pvt Ltd' },
      { key: 'service_name', label: 'Compliance Service', example: 'TDS Return Q4' },
      { key: 'deadline_date', label: 'Statutory Deadline', example: '31st May 2026' },
      { key: 'financial_year', label: 'Financial Year', example: 'FY 2025-26' },
      { key: 'firm_name', label: 'CA Firm Name', example: 'Sharma & Associates CA' },
    ],
    starterTemplates: [
      {
        category: 'reminder',
        type: 'gst_deadline_reminder',
        name: 'GST Return Filing Deadline Reminder',
        subject: 'Urgent: GST Return Filing Deadline Approaching - {{firm_name}}',
        body: `<p>Dear {{client_name}},</p>
<p>This is a compliance reminder that the monthly GST filing deadline for {{financial_year}} is approaching on <strong>{{deadline_date}}</strong>.</p>
<p>Kindly send us your sales and purchase registers and invoices at the earliest to ensure timely reconciliation and avoid statutory late fees.</p>
<p>Best regards,<br/>{{firm_name}}</p>`,
      },
      {
        category: 'reminder',
        type: 'tds_documents_request',
        name: 'TDS Challan & Salary Sheet Request',
        subject: 'Action Required: Submit TDS Challan & Deductee Sheets for {{service_name}}',
        body: `<p>Dear {{client_name}},</p>
<p>In order to prepare your {{service_name}} filing for {{financial_year}}, please upload your ITNS 281 challans and deductee spreadsheets on the client portal.</p>
<p>Deadline for submission: <strong>{{deadline_date}}</strong>.</p>
<p>Regards,<br/>{{firm_name}}</p>`,
      },
    ],
  },

  custom: {
    key: 'custom',
    name: 'General Business & Other',
    description: 'Custom newsletters, transactional notices, client announcements',
    icon: 'Mail',
    variables: [
      { key: 'recipient_name', label: 'Recipient Name', example: 'Valued Client' },
      { key: 'company_name', label: 'Your Company', example: 'Acme Enterprises' },
      { key: 'date', label: 'Current Date', example: 'Oct 16, 2026' },
    ],
    starterTemplates: [
      {
        category: 'notification',
        type: 'general_announcement',
        name: 'General Business Announcement',
        subject: 'Important Update from {{company_name}}',
        body: `<p>Hello {{recipient_name}},</p>
<p>We are writing to share an important update regarding our services at {{company_name}}.</p>
<p>Please feel free to reach out if you have any questions.</p>
<p>Best regards,<br/>Team {{company_name}}</p>`,
      },
    ],
  },
};
