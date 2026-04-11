import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Organization } from '../entities/organization.entity';
import { deriveKey, decrypt } from '../common/utils/crypto.util';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class EmailService {
  private globalTransporter: Transporter | null = null;
  private readonly transporterCache = new Map<number, Transporter>();
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    if (host && user && pass) {
      this.globalTransporter = nodemailer.createTransport({
        host,
        port: parseInt(String(this.config.get('SMTP_PORT') ?? 465), 10),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
      this.logger.log(`Global SMTP: ${host} (user ${this.maskEmail(user)})`);
    } else {
      this.logger.warn(
        'Global SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — transactional emails will fail or be skipped.',
      );
    }
  }

  private maskEmail(email: string): string {
    const [a, d] = email.split('@');
    if (!d) return '***';
    return `${(a ?? '').slice(0, 2)}***@${d}`;
  }

  private get globalFrom(): string {
    return (
      this.config.get<string>('SMTP_FROM') ??
      this.config.get<string>('SMTP_USER') ??
      'noreply@localhost'
    );
  }

  private getEncryptionKey(): Buffer {
    const k =
      this.config.get<string>('SMTP_ENCRYPTION_KEY') ??
      'navedhana-smtp-default-key-change-in-prod';
    return deriveKey(k);
  }

  /** Invalidate the cached transporter for an org (call after SMTP config is changed or removed) */
  invalidateOrgTransporter(orgId: number): void {
    this.transporterCache.delete(orgId);
  }

  private async resolveOrgTransporter(
    orgId: number,
  ): Promise<{ transporter: Transporter; from: string } | null> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org?.smtpHost || !org?.smtpUser || !org?.smtpPass) return null;

    if (!this.transporterCache.has(orgId)) {
      try {
        const key = this.getEncryptionKey();
        const pass = decrypt(org.smtpPass, key);
        const transporter = nodemailer.createTransport({
          host: org.smtpHost,
          port: org.smtpPort ?? 587,
          secure: org.smtpSecure ?? false,
          auth: { user: org.smtpUser, pass },
        });
        this.transporterCache.set(orgId, transporter);
      } catch (err) {
        this.logger.error(
          `Failed to create transporter for org ${orgId} — SMTP password may need re-saving if SMTP_ENCRYPTION_KEY changed:`,
          err,
        );
        return null;
      }
    }

    const transporter = this.transporterCache.get(orgId)!;
    return { transporter, from: org.smtpFrom ?? org.smtpUser };
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    fromName?: string,
    orgId?: number,
  ): Promise<boolean> {
    let transporter: Transporter | null = null;
    let fromAddress = this.globalFrom;

    if (orgId != null) {
      const orgResult = await this.resolveOrgTransporter(orgId);
      if (orgResult) {
        transporter = orgResult.transporter;
        fromAddress = orgResult.from;
      }
    }

    if (!transporter) {
      transporter = this.globalTransporter;
      fromAddress = this.globalFrom;
    }

    if (!transporter) {
      this.logger.warn('SMTP not configured; email not sent');
      return false;
    }

    const from = fromName
      ? `"${fromName.replace(/"/g, '\\"')}" <${fromAddress}>`
      : fromAddress;

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html: html ?? text.replace(/\n/g, '<br>'),
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (err: unknown) {
      this.logger.error(`Failed to send email to ${to}:`, err);
      const e = err as { code?: string; responseCode?: number };
      if (e?.code === 'EAUTH' || e?.responseCode === 535) {
        const scope =
          orgId != null
            ? `organization SMTP (org id ${orgId} — check saved SMTP in DB / org settings; wrong password or encryption key)`
            : `global SMTP in .env (not a database error — fix SMTP_USER/SMTP_PASS; Hostinger needs the mailbox password for ${this.config.get<string>('SMTP_USER')?.includes('@') ? 'that email' : 'SMTP_USER'})`;
        this.logger.warn(
          `SMTP login rejected (535). ${scope}. See Hostinger hPanel → Email → manage mailbox password.`,
        );
      }
      return false;
    }
  }

  async sendClientLoginCredentials(
    email: string,
    name: string,
    generatedPassword: string,
    orgId?: number,
  ): Promise<boolean> {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const subject = 'Your CA Client Portal Login Credentials';
    const text = `Hello ${name},\n\nYour CA organization has created a client account for you.\n\nLogin URL: ${frontendUrl}\nEmail: ${email}\nTemporary password: ${generatedPassword}\n\nPlease log in and change your password using "Forgot password" if you wish to set a custom password.\n\nKeep this email secure and do not share your password.`;
    const html = `
      <p>Hello ${name},</p>
      <p>Your CA organization has created a client account for you.</p>
      <p><strong>Login URL:</strong> <a href="${frontendUrl}">${frontendUrl}</a></p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Temporary password:</strong> ${generatedPassword}</p>
      <p>Please log in and use <strong>Forgot password</strong> to set a custom password if you wish.</p>
      <p>Keep this email secure and do not share your password.</p>
    `;
    return this.sendMail(email, subject, text, html, undefined, orgId);
  }

  /** Default recipients for Lekvya team notifications (contact form, signups, digests). */
  private getTeamRecipientEmails(): string[] {
    const fromEnv = this.config.get<string>('CONTACT_TEAM_EMAILS');
    if (fromEnv?.trim()) {
      return fromEnv
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }
    return [
      'navedhanaprofitamplifier@gmail.com',
      'mettumanith0@gmail.com',
      'likithkarnekota@gmail.com',
      'omprakash160003@gmail.com',
    ];
  }

  async sendMailToTeam(
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    const recipients = this.getTeamRecipientEmails();
    if (recipients.length === 0) {
      this.logger.warn('No team recipient emails configured');
      return false;
    }
    return this.sendMail(
      recipients.join(', '),
      subject,
      text,
      html,
      'Team Lekvya',
    );
  }

  async sendContactInquiryToTeam(data: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    message: string;
  }): Promise<boolean> {
    const subject = `Lekvya — Contact: ${data.firstName} ${data.lastName}`;
    const text = [
      `New contact form submission`,
      ``,
      `Name: ${data.firstName} ${data.lastName}`,
      `Email: ${data.email}`,
      `Company: ${data.company ?? '—'}`,
      ``,
      `Message:`,
      data.message,
    ].join('\n');
    const html = `
      <p><strong>New contact form submission</strong></p>
      <p><strong>Name:</strong> ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}<br/>
      <strong>Email:</strong> ${escapeHtml(data.email)}<br/>
      <strong>Company:</strong> ${escapeHtml(data.company ?? '—')}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(data.message).replace(/\n/g, '<br/>')}</p>
    `;
    return this.sendMailToTeam(subject, text, html);
  }

  async sendContactConfirmationToUser(email: string): Promise<boolean> {
    const subject = 'We received your message — Team Lekvya';
    const text = [
      `Hello,`,
      ``,
      `Thank you for contacting us. Your response was received successfully and we will get back to you soon.`,
      ``,
      `Best regards,`,
      `Team Lekvya`,
    ].join('\n');
    const html = `
      <p>Hello,</p>
      <p>Thank you for contacting us. Your response was received successfully and we will get back to you soon.</p>
      <p>Best regards,<br/><strong>Team Lekvya</strong></p>
    `;
    return this.sendMail(email, subject, text, html, 'Team Lekvya');
  }

  async sendNewOrganizationSignupToTeam(params: {
    organizationName: string;
    adminEmail: string;
    adminName: string;
    adminPhone?: string | null;
  }): Promise<boolean> {
    const subject = `Lekvya — New org signup: ${params.organizationName}`;
    const text = [
      `A new organization registered and is pending approval.`,
      ``,
      `Organization: ${params.organizationName}`,
      `Admin name: ${params.adminName}`,
      `Admin email: ${params.adminEmail}`,
      `Admin phone: ${params.adminPhone ?? '—'}`,
    ].join('\n');
    const html = `
      <p><strong>New organization registration (pending approval)</strong></p>
      <p><strong>Organization:</strong> ${escapeHtml(params.organizationName)}<br/>
      <strong>Admin:</strong> ${escapeHtml(params.adminName)}<br/>
      <strong>Email:</strong> ${escapeHtml(params.adminEmail)}<br/>
      <strong>Phone:</strong> ${escapeHtml(params.adminPhone ?? '—')}</p>
    `;
    return this.sendMailToTeam(subject, text, html);
  }

  /** Sent to the org admin right after self-service signup (pending approval). */
  async sendNewOrganizationSignupPendingToAdmin(params: {
    adminEmail: string;
    adminName: string;
    organizationName: string;
  }): Promise<boolean> {
    const subject = `Lekvya — Registration received (pending approval): ${params.organizationName}`;
    const text = [
      `Hello ${params.adminName},`,
      ``,
      `Thank you for registering "${params.organizationName}" on Lekvya.`,
      ``,
      `Your account is pending master admin approval. You cannot sign in until your organization is approved. We will email you again once you can access the platform.`,
      ``,
      `Best regards,`,
      `Team Lekvya`,
    ].join('\n');
    const html = `
      <p>Hello ${escapeHtml(params.adminName)},</p>
      <p>Thank you for registering <strong>${escapeHtml(params.organizationName)}</strong> on Lekvya.</p>
      <p><strong>Your account is pending master admin approval.</strong> You cannot sign in until your organization is approved. We will email you again once you can access the platform.</p>
      <p>Best regards,<br/><strong>Team Lekvya</strong></p>
    `;
    return this.sendMail(params.adminEmail, subject, text, html, 'Team Lekvya');
  }

  async sendOrganizationApprovedToAdmin(params: {
    adminEmail: string;
    organizationName: string;
    accessUntil: Date;
  }): Promise<boolean> {
    const until = params.accessUntil.toISOString();
    const subject = `Your Lekvya account is approved — ${params.organizationName}`;
    const text = [
      `Hello,`,
      ``,
      `Your organization "${params.organizationName}" has been approved.`,
      ``,
      `You can sign in and use the platform until ${until} (trial period). After that, a subscription is required.`,
      ``,
      `Best regards,`,
      `Team Lekvya`,
    ].join('\n');
    const html = `
      <p>Hello,</p>
      <p>Your organization <strong>${escapeHtml(params.organizationName)}</strong> has been approved.</p>
      <p>You can sign in and use the platform until <strong>${escapeHtml(until)}</strong> (trial period). After that, a subscription is required.</p>
      <p>Best regards,<br/><strong>Team Lekvya</strong></p>
    `;
    return this.sendMail(params.adminEmail, subject, text, html, 'Team Lekvya');
  }

  async sendPendingOrganizationsDigestToTeam(
    lines: { orgName: string; adminEmail: string; createdAt: Date }[],
  ): Promise<boolean> {
    if (lines.length === 0) return true;
    const subject = `Lekvya — Daily: ${lines.length} pending organization(s)`;
    const body = lines
      .map(
        (l, i) =>
          `${i + 1}. ${l.orgName} — ${l.adminEmail} (${l.createdAt.toISOString()})`,
      )
      .join('\n');
    const text = [`Pending organization registrations:`, ``, body].join('\n');
    const html = `<p><strong>Pending organization registrations</strong></p><ul>${lines
      .map(
        (l) =>
          `<li>${escapeHtml(l.orgName)} — ${escapeHtml(l.adminEmail)} (${escapeHtml(
            l.createdAt.toISOString(),
          )})</li>`,
      )
      .join('')}</ul>`;
    return this.sendMailToTeam(subject, text, html);
  }

  async sendOtp(email: string, otp: string): Promise<boolean> {
    const subject = 'Your Password Reset OTP';
    const text = `Your one-time password for resetting your password is: ${otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.`;
    const html = `
      <p>Your one-time password for resetting your password is: <strong>${otp}</strong></p>
      <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
    `;
    return this.sendMail(email, subject, text, html);
  }

  /** Create a transporter from raw config and verify connectivity. Used by the test-smtp endpoint. */
  async verifySmtpConfig(
    host: string,
    port: number,
    secure: boolean,
    user: string,
    pass: string,
  ): Promise<void> {
    const t = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    await t.verify();
  }
}
