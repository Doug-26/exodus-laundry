import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AuthService } from '../../auth/auth.service';
import { homeRouteForRole } from '../../auth/role-routes';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonButton,
    IonNote,
    IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Sign in</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (denied()) {
        <ion-text color="danger">
          <p role="alert">This account can’t use the app. Contact the shop.</p>
        </ion-text>
      }

      <form [formGroup]="form" (ngSubmit)="login()">
        <ion-list>
          <ion-item>
            <ion-input
              label="Email"
              labelPlacement="stacked"
              type="email"
              autocomplete="username"
              formControlName="email"
            ></ion-input>
          </ion-item>
          @if (invalid('email')) {
            <ion-note color="danger" role="alert">Enter a valid email.</ion-note>
          }

          <ion-item>
            <ion-input
              label="Password"
              labelPlacement="stacked"
              type="password"
              autocomplete="current-password"
              formControlName="password"
            ></ion-input>
          </ion-item>
          @if (invalid('password')) {
            <ion-note color="danger" role="alert">Password is required.</ion-note>
          }
        </ion-list>

        @if (error()) {
          <ion-text color="danger"><p role="alert">{{ error() }}</p></ion-text>
        }

        <ion-button expand="block" type="submit" [disabled]="busy()">Sign in</ion-button>
      </form>

      <ion-button expand="block" fill="clear" routerLink="/signup" [disabled]="busy()">
        Create an account
      </ion-button>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required]),
  });

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly denied = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params.has('denied')) {
        this.denied.set(true);
        // Strip the param so a refresh (or the next user) doesn't keep the notice.
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });
  }

  protected invalid(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  async login(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.loginEmail(email, password);
      await this.router.navigateByUrl(homeRouteForRole(this.auth.role()));
    } catch {
      this.error.set('Incorrect email or password.');
    } finally {
      this.busy.set(false);
    }
  }
}
