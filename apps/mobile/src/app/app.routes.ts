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
    // Declared before 'orders/:id' so the 3-segment route matches first.
    path: 'orders/:id/deliver',
    canActivate: [authGuard, customerGuard],
    loadComponent: () => import('./features/deliver/deliver.page').then((m) => m.DeliverPage),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard, customerGuard],
    loadComponent: () =>
      import('./features/order-detail/order-detail.page').then((m) => m.OrderDetailPage),
  },
  {
    // Declared before 'rider' so the more specific route matches first.
    path: 'rider/delivery/:id',
    canActivate: [authGuard, customerRiderGuard],
    loadComponent: () =>
      import('./features/rider-delivery/rider-delivery.page').then((m) => m.RiderDeliveryPage),
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
