import { Routes } from '@angular/router';
import {
  authGuard,
  customerGuard,
  customerRiderGuard,
  redirectIfAuthedGuard,
} from './auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [redirectIfAuthedGuard],
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'signup',
    canActivate: [redirectIfAuthedGuard],
    loadComponent: () => import('./features/signup/signup.page').then((m) => m.SignupPage),
  },
  {
    path: 'home',
    canActivate: [authGuard, customerGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    // Declared before 'orders/:id' (first-match router).
    path: 'orders/new',
    canActivate: [authGuard, customerGuard],
    loadComponent: () => import('./features/new-order/new-order.page').then((m) => m.NewOrderPage),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard, customerGuard],
    loadComponent: () =>
      import('./features/order-detail/order-detail.page').then((m) => m.OrderDetailPage),
  },
  {
    path: 'rider',
    canActivate: [authGuard, customerRiderGuard],
    loadComponent: () => import('./features/rider-home/rider-home.page').then((m) => m.RiderHomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: 'home' },
];
