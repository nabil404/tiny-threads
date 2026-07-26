import { ConflictException } from '@nestjs/common';
import { CustomersAuthService } from '../customers-auth.service';
import { TokenService } from '../../auth-core/token.service';

// NOTE: CustomersAuthService's constructor gains a fourth TokenService
// parameter in Task 10 (login/refresh/logout need it to sign access
// tokens). This helper takes a stub for it now so this file doesn't need
// editing again when Task 10 lands — Task 10 adds its own describe blocks
// using this same helper, passing a real TokenService where it matters.
function buildService() {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((entity: any) =>
      Promise.resolve({ id: 'generated-id', ...entity }),
    ),
  };
  const tenantDb = { run: jest.fn((work: any) => work(manager)) } as any;
  const hashing = {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    verify: jest.fn(),
  } as any;
  const notifications = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tokenService = new TokenService({
    sign: jest.fn().mockReturnValue('signed-jwt'),
  } as any);
  const service = new CustomersAuthService(
    tenantDb,
    hashing,
    notifications,
    tokenService,
  );
  return { service, manager, hashing, notifications, tokenService };
}

describe('CustomersAuthService.register', () => {
  it('creates a customer and a password identity, then sends a verification email', async () => {
    const { service, manager, hashing, notifications } = buildService();
    manager.findOne.mockResolvedValue(null);

    const result = await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(hashing.hash).toHaveBeenCalledWith('correct horse battery staple');
    expect(manager.save).toHaveBeenCalledTimes(2); // Customer, then CustomerIdentity
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'verification-email',
      expect.objectContaining({ token: expect.any(String) }),
    );
    expect(result).toEqual({ customerId: 'generated-id' });
  });

  it('rejects registration when the email already exists for this tenant', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValue({ id: 'existing-customer' });

    await expect(
      service.register({
        email: 'jane@example.com',
        password: 'correct horse battery staple',
        name: 'Jane',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
