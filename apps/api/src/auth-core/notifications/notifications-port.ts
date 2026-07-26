export type EmailTemplate = 'verification-email' | 'password-reset';

export interface NotificationsPort {
  sendEmail(to: string, template: EmailTemplate, data: Record<string, unknown>): Promise<void>;
}

export const NOTIFICATIONS_PORT = Symbol('NOTIFICATIONS_PORT');
