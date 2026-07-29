import { Test } from '@nestjs/testing';
import { NOTIFICATIONS_PORT } from '../notifications-port';
import { NotificationsModule } from '../notifications.module';

describe('NotificationsModule', () => {
  it('provides NOTIFICATIONS_PORT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule],
    }).compile();

    expect(moduleRef.get(NOTIFICATIONS_PORT)).toBeDefined();
  });
});
