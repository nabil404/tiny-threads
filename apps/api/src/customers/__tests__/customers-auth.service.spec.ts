import { ConflictException } from '@nestjs/common';
import { CustomersAuthService } from '../customers-auth.service';
import { TokenService } from '../../auth-core/token.service';

// NOTE: CustomersAuthService's constructor gains a fourth TokenService
// parameter in Task 10 (login/refresh/logout need it to sign access
// tokens). This helper takes a stub for it now so this file doesn't need
// editing again when Task 10 lands — Task 10 adds its own describe blocks
// using this same helper, passing a real TokenService where it matters.
//
// A fifth ClsService param was added during Task 9 review fix round 1 —
// register() needs tenantId (set into CLS by TenantResolutionMiddleware) to
// stamp it onto the Customer/CustomerIdentity rows it creates.
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
  const cls = { get: jest.fn().mockReturnValue('tenant-1') } as any;
  const service = new CustomersAuthService(
    tenantDb,
    hashing,
    notifications,
    tokenService,
    cls,
  );
  return { service, manager, hashing, notifications, tokenService, cls };
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

  it('stamps tenantId (read from CLS) onto both the customer and the identity it creates', async () => {
    const { service, manager, cls } = buildService();
    manager.findOne.mockResolvedValue(null);

    await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(cls.get).toHaveBeenCalledWith('tenantId');
    expect(manager.create).toHaveBeenCalledTimes(2);
    for (const [, data] of manager.create.mock.calls) {
      expect(data).toEqual(expect.objectContaining({ tenantId: 'tenant-1' }));
    }
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

  it('does not send the verification email when the DB transaction fails', async () => {
    const { service, manager, notifications } = buildService();
    manager.findOne.mockResolvedValue({ id: 'existing-customer' });

    await expect(
      service.register({
        email: 'jane@example.com',
        password: 'correct horse battery staple',
        name: 'Jane',
      }),
    ).rejects.toThrow(ConflictException);

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('sends the verification email only after the DB transaction has resolved', async () => {
    const { service, manager, notifications } = buildService();
    manager.findOne.mockResolvedValue(null);

    const callOrder: string[] = [];
    manager.save.mockImplementation((entity: any) => {
      callOrder.push('db-save');
      return Promise.resolve({ id: 'generated-id', ...entity });
    });
    notifications.sendEmail.mockImplementation(() => {
      callOrder.push('send-email');
      return Promise.resolve(undefined);
    });

    await service.register({
      email: 'jane@example.com',
      password: 'correct horse battery staple',
      name: 'Jane',
    });

    expect(callOrder).toEqual(['db-save', 'db-save', 'send-email']);
  });
});
