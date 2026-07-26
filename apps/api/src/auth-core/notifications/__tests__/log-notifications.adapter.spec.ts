import { LogNotificationsAdapter } from '../log-notifications.adapter';

describe('LogNotificationsAdapter', () => {
  it('logs the email send and resolves', async () => {
    const adapter = new LogNotificationsAdapter();
    const logSpy = jest
      .spyOn((adapter as any).logger, 'log')
      .mockImplementation(() => undefined);

    await expect(
      adapter.sendEmail('user@example.com', 'verification-email', {
        token: 'abc',
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('user@example.com'),
    );
  });

  it('redacts token-like values so the raw token never reaches the log', async () => {
    const adapter = new LogNotificationsAdapter();
    const logSpy = jest
      .spyOn((adapter as any).logger, 'log')
      .mockImplementation(() => undefined);

    await adapter.sendEmail('user@example.com', 'verification-email', {
      token: 'super-secret-raw-token',
    });

    const loggedMessage = logSpy.mock.calls[0][0] as string;
    expect(loggedMessage).not.toContain('super-secret-raw-token');
    expect(loggedMessage).toContain('[REDACTED]');
  });
});
