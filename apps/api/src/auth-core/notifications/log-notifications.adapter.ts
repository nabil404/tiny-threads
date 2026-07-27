import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplate, NotificationsPort } from './notifications-port';

// Matches any data key that looks like it carries a secret (verification
// tokens, password-reset tokens, etc.) so this adapter never writes the raw
// value to logs — log access shouldn't be enough to hijack an account.
const SENSITIVE_KEY_PATTERN = /token/i;

@Injectable()
export class LogNotificationsAdapter implements NotificationsPort {
  private readonly logger = new Logger(LogNotificationsAdapter.name);

  // Not `async`: this adapter only writes a log line, so there is nothing to
  // await. Real adapters (SES/SendGrid/…) will be genuinely async, which is why
  // NotificationsPort still returns a Promise.
  sendEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, unknown>,
  ): Promise<void> {
    const redactedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : value,
      ]),
    );
    this.logger.log(
      `sendEmail to=${to} template=${template} data=${JSON.stringify(redactedData)}`,
    );
    return Promise.resolve();
  }
}
