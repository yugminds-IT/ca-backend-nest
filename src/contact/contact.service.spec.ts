import { ContactService } from './contact.service';

describe('ContactService', () => {
  it('normalises the submission, emails the team and confirms to the visitor', async () => {
    const email = {
      sendContactInquiryToTeam: jest.fn(),
      sendContactConfirmationToUser: jest.fn(),
    };
    const service = new ContactService(email as any);

    const res = await service.submit({
      firstName: ' Asha ',
      lastName: ' Rao ',
      email: ' Asha@Example.COM ',
      company: ' Rao & Co ',
      message: ' Need a demo ',
    });

    expect(email.sendContactInquiryToTeam).toHaveBeenCalledWith({
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
      company: 'Rao & Co',
      message: 'Need a demo',
    });
    expect(email.sendContactConfirmationToUser).toHaveBeenCalledWith(
      'asha@example.com',
    );
    expect(res.message).toMatch(/received successfully/);
  });

  it('does not confirm to the visitor if the team email fails', async () => {
    const email = {
      sendContactInquiryToTeam: jest
        .fn()
        .mockRejectedValue(new Error('SMTP down')),
      sendContactConfirmationToUser: jest.fn(),
    };
    const service = new ContactService(email as any);

    await expect(
      service.submit({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
        message: 'm',
      }),
    ).rejects.toThrow('SMTP down');
    expect(email.sendContactConfirmationToUser).not.toHaveBeenCalled();
  });
});
