import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplate, NotificationsPort } from './notifications-port';

@Injectable()
export class LogNotificationsAdapter implements NotificationsPort {
  private readonly logger = new Logger(LogNotificationsAdapter.name);

  async sendEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`sendEmail to=${to} template=${template} data=${JSON.stringify(data)}`);
  }
}
