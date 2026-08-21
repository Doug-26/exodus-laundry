import { Routes } from '@angular/router';
import { adminGuard, authGuard, redirectIfAuthedGuard, staffAdminGuard } from './auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [redirectIfAuthedGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard, staffAdminGuard],
    loadComponent: () => import('./features/queue/queue').then((m) => m.QueueComponent),
  },
  {
    // Must be declared before 'orders/:id' (first-match router).
    path: 'orders/new',
    canActivate: [authGuard, staffAdminGuard],
    loadComponent: () => import('./features/new-order/new-order').then((m) => m.NewOrderComponent),
  },
  {
    path: 'orders/:id',
    canActivate: [authGuard, staffAdminGuard],
    loadComponent: () => import('./features/order-detail/order-detail').then((m) => m.OrderDetailComponent),
  },
  {
    path: 'team',
    canActivate: [authGuard, staffAdminGuard, adminGuard],
    loadComponent: () => import('./features/team/team').then((m) => m.TeamComponent),
  },
  {
    path: 'rates',
    canActivate: [authGuard, staffAdminGuard, adminGuard],
    loadComponent: () => import('./features/rates/rates').then((m) => m.RatesComponent),
  },
  {
    path: 'reports',
    canActivate: [authGuard, staffAdminGuard, adminGuard],
    loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsComponent),
  },
  { path: '**', redirectTo: '' },
];
