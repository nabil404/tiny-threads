import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';

function buildContext(
  role: string | undefined,
  requiredRoles: string[] | undefined,
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as any;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows access when the user role is in the required list', () => {
    const { guard, context } = buildContext('owner', ['owner', 'admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the user role is not in the required list', () => {
    const { guard, context } = buildContext('viewer', ['owner', 'admin']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows access when no roles are required', () => {
    const { guard, context } = buildContext('viewer', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });
});
