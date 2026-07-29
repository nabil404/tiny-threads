import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MerchantAdminsAuthController } from '../merchant-admins-auth.controller';
import { MerchantAdminJwtAuthGuard } from '../guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Fix round 1 (security): POST /merchant-admins/auth/invite is the ONLY path
// that grants a role now that register() no longer accepts a caller-supplied
// role. If this endpoint were ever left unguarded (or guarded by only one of
// the two guards), any authenticated merchant admin — regardless of role —
// could invite themselves or someone else in as 'owner', which is exactly
// the privilege-escalation hole this fix round closes. These tests read the
// same Reflect metadata Nest itself uses to enforce guards/roles, so they
// fail if either decorator is ever removed from the route.
// Read via the property descriptor rather than `Controller.prototype.invite`
// directly — a bare reference to a class method (even one that's never
// called) trips @typescript-eslint/unbound-method's `this`-scoping check.
// Reflect.getMetadata only needs the function object as a metadata target,
// never invokes it, so there's no unbound-`this` risk here.
const inviteMethod: unknown = Object.getOwnPropertyDescriptor(
  MerchantAdminsAuthController.prototype,
  'invite',
)?.value;

describe('MerchantAdminsAuthController.invite route metadata', () => {
  it('requires both MerchantAdminJwtAuthGuard and RolesGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      inviteMethod as object,
    ) as unknown[];

    expect(guards).toContain(MerchantAdminJwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('restricts invite to the owner and admin roles', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      inviteMethod as object,
    ) as string[];

    expect(roles).toEqual(['owner', 'admin']);
  });
});
