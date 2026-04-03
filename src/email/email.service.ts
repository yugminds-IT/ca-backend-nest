import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Organization } from '../entities/organization.entity';
import { deriveKey, decrypt } from '../common/utils/crypto.util';

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
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (host && user && pass) {
      this.globalTransporter = nodemailer.createTransport({
        host,
        port: parseInt(String(this.config.get('SMTP_PORT') ?? 465), 10),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
    }
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
        this.logger.error(`Failed to create transporter for org ${orgId}:`, err);
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
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}:`, err);
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
