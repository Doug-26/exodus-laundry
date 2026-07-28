import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Must be authenticated; otherwise go to /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.status() === 'authed' ? true : router.createUrlTree(['/login']);
};

/**
 * Must be admin or staff. A logged-in customer/rider (wrong surface) or an
 * unprovisioned account is signed out and sent to /login with a message,
 * avoiding a redirect loop.
 */
export const staffAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const role = auth.role();
  if (role === 'admin' || role === 'staff') {
    return true;
  }
  await auth.logout();
  return router.createUrlTree(['/login'], { queryParams: { denied: 'surface' } });
};

/** Admin-only routes (e.g. /team). Non-admins bounce to the home root. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.role() === 'admin' ? true : router.createUrlTree(['/']);
};

/** For /login: send already-authorized users to the app instead of the form. */
export const redirectIfAuthedGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const role = auth.role();
  return role === 'admin' || role === 'staff' ? router.createUrlTree(['/']) : true;
};
