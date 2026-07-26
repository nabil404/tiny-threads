import { LogNotificationsAdapter } from '../log-notifications.adapter';

describe('LogNotificationsAdapter', () => {
  it('logs the email send and resolves', async () => {
    const adapter = new LogNotificationsAdapter();
    const logSpy = jest.spyOn((adapter as any).logger, 'log').mockImplementation(() => undefined);

    await expect(
      adapter.sendEmail('user@example.com', 'verification-email', { token: 'abc' }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('user@example.com'),
    );
  });
});
