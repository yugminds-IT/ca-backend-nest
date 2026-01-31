import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(String(this.config.get('SMTP_PORT') ?? 465), 10),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
    }
  }

  private get from(): string {
    return this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('SMTP_USER') ?? 'noreply@localhost';
  }

  async sendMail(to: string, subject: string, text: string, html?: string, fromName?: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured; email not sent');
      return false;
    }
    const from = fromName ? `"${fromName.replace(/"/g, '\\"')}" <${this.from}>` : this.from;
    try {
      await this.transporter.sendMail({
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

  async sendClientLoginCredentials(email: string, name: string, generatedPassword: string): Promise<boolean> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
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
    return this.sendMail(email, subject, text, html);
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
}
