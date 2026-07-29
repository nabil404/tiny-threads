export type EmailTemplate =
  'verification-email' | 'password-reset' | 'merchant-invite';

export interface NotificationsPort {
  sendEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, unknown>,
  ): Promise<void>;
}

export const NOTIFICATIONS_PORT = Symbol('NOTIFICATIONS_PORT');
