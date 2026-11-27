/**
 * Whether to open the SMTP connection with TLS from the first byte ("implicit TLS").
 * The well-known ports decide it: 465 is always implicit TLS, 587 and 25 always start plain and upgrade
 * (STARTTLS). Getting this backwards fails with "wrong version number", so the port wins over the saved
 * flag. Any other port follows the flag.
 */
export function effectiveSmtpSecure(port: number, secure: boolean): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25) return false;
  return secure;
}

/** Turns the raw error from the mail library into something a person can act on. */
export function friendlySmtpError(message: string): string {
  if (/wrong version number|ssl routines|packet length too long/i.test(message)) {
    return 'The server did not answer with TLS on this port. Use port 465 with "Implicit TLS" on, or port 587 with it off.';
  }
  if (/Application-specific password|InvalidSecondFactor|5\.7\.9/i.test(message)) {
    return 'Gmail needs an app password, not your normal password. Turn on 2-Step Verification, create one at myaccount.google.com/apppasswords, and paste the 16 characters here.';
  }
  if (/EAUTH|Invalid login|authentication failed|535/i.test(message)) {
    return 'The server refused the username or password. For Gmail and Outlook use an app password.';
  }
  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return 'The host name could not be found. Check the SMTP host for typos.';
  }
  if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|timed out/i.test(message)) {
    return 'Could not reach the server. Check the host and port, and that your network allows outgoing SMTP.';
  }
  return message;
}
