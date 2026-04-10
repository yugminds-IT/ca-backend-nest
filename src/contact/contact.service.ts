import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { ContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(private readonly emailService: EmailService) {}

  async submit(dto: ContactDto) {
    await this.emailService.sendContactInquiryToTeam({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.trim().toLowerCase(),
      company: dto.company?.trim(),
      message: dto.message.trim(),
    });
    await this.emailService.sendContactConfirmationToUser(dto.email.trim().toLowerCase());
    return {
      message:
        'Thank you. Your response was received successfully and we will get back to you soon. Best regards, Team Lekvya',
    };
  }
}
