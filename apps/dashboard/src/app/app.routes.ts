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
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'team',
    canActivate: [authGuard, staffAdminGuard, adminGuard],
    loadComponent: () => import('./features/team/team').then((m) => m.TeamComponent),
  },
  { path: '**', redirectTo: '' },
];
