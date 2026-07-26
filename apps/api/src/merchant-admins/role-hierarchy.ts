// Ordered highest-privilege first. RolesGuard/@Roles only checks that a
// caller holds ANY role from an allowed set — it says nothing about whether
// the role being GRANTED (via inviteMember()) outranks the caller's own.
// Without this check, any 'admin' could invite someone (or themselves,
// under a fresh identity) in as 'owner', making an admin credential
// equivalent to an owner credential.
export const ROLE_HIERARCHY = ['owner', 'admin', 'staff', 'viewer'] as const;

export type MerchantRole = (typeof ROLE_HIERARCHY)[number];

// True when `role` sits strictly above `callerRole` in the hierarchy (lower
// array index = higher privilege) — i.e. when granting `role` would be a
// privilege escalation for `callerRole`. Fails closed: either an
// unrecognized `role` or an unrecognized `callerRole` is treated as an
// escalation and rejected, rather than silently allowed through. Neither
// case should be reachable in practice — InviteMemberDto's @IsIn already
// restricts `role` to ROLE_HIERARCHY's members, and callerRole comes from a
// verified JWT's own role claim — this is defense-in-depth, not the primary
// guard.
export function roleOutranks(role: string, callerRole: string): boolean {
  const roleRank = ROLE_HIERARCHY.indexOf(role as MerchantRole);
  const callerRank = ROLE_HIERARCHY.indexOf(callerRole as MerchantRole);
  if (roleRank === -1 || callerRank === -1) return true;
  return roleRank < callerRank;
}
