import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { homeRouteForRole } from './role-routes';

/** Must be authenticated; otherwise go to /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.status() === 'authed' ? true : router.createUrlTree(['/login']);
};

/**
 * Must be a customer or rider. An admin/staff on the mobile app (wrong surface)
 * or an unprovisioned account is signed out and sent to /login with a message.
 */
export const customerRiderGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const role = auth.role();
  if (role === 'customer' || role === 'rider') {
    return true;
  }
  await auth.logout();
  return router.createUrlTree(['/login'], { queryParams: { denied: 'surface' } });
};

/** Customer-only routes (order list / new order / detail). Riders → /rider; others signed out. */
export const customerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const role = auth.role();
  if (role === 'customer') {
    return true;
  }
  if (role === 'rider') {
    return router.createUrlTree(['/rider']);
  }
  await auth.logout();
  return router.createUrlTree(['/login'], { queryParams: { denied: 'surface' } });
};

/** For /login and /signup: send already-authorized users to their home. */
export const redirectIfAuthedGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  const role = auth.role();
  return role === 'customer' || role === 'rider'
    ? router.createUrlTree([homeRouteForRole(role)])
    : true;
};
