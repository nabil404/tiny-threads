import { Module } from '@nestjs/common';
import { NOTIFICATIONS_PORT } from './notifications-port';
import { LogNotificationsAdapter } from './log-notifications.adapter';

@Module({
  providers: [
    { provide: NOTIFICATIONS_PORT, useClass: LogNotificationsAdapter },
  ],
  exports: [NOTIFICATIONS_PORT],
})
export class NotificationsModule {}
