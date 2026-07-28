import type { UserRole } from '@exodus/shared';

/** Where a mobile user lands after login, by role. */
export function homeRouteForRole(role: UserRole | null): string {
  return role === 'rider' ? '/rider' : '/home';
}
