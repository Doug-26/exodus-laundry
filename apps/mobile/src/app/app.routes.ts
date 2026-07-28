import { Routes } from '@angular/router';
import { authGuard, customerRiderGuard, redirectIfAuthedGuard } from './auth/auth.guards';

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
    canActivate: [authGuard, customerRiderGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
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
