import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormField, email as emailRule, form, required } from '@angular/forms/signals';
import { AuthService } from '../../auth/auth.service';

interface LoginModel {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [FormField],
  template: `
    <main class="login">
      <img src="logo-full.png" alt="" class="login__logo" />
      <h1>Exodus Laundry — Staff</h1>

      @if (denied()) {
        <p class="banner banner--error" role="alert">
          This account can’t access the dashboard. Contact your administrator.
        </p>
      }

      <form class="card" (submit)="login($event)" novalidate>
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          autocomplete="username"
          [formField]="f.email"
          [attr.aria-invalid]="showError(f.email().touched(), f.email().invalid())"
        />
        @if (showError(f.email().touched(), f.email().invalid())) {
          <p class="field-error" role="alert">{{ f.email().errors()[0]?.message }}</p>
        }

        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          [formField]="f.password"
          [attr.aria-invalid]="showError(f.password().touched(), f.password().invalid())"
        />
        @if (showError(f.password().touched(), f.password().invalid())) {
          <p class="field-error" role="alert">{{ f.password().errors()[0]?.message }}</p>
        }

        @if (error()) {
          <p class="banner banner--error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn btn--primary" [disabled]="busy()">Sign in</button>
      </form>

      <button type="button" class="btn btn--ghost btn--google" (click)="google()" [disabled]="busy()">
        <svg class="btn__g" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"></path>
          <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"></path>
          <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"></path>
          <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"></path>
        </svg>
        Continue with Google
      </button>

      <button type="button" class="link" (click)="forgot()" [disabled]="busy()">
        Forgot password?
      </button>
      @if (resetSent()) {
        <p class="banner banner--ok" role="status">Password reset email sent — check your inbox.</p>
      }
    </main>
  `,
  styles: `
    .login { max-width: 24rem; margin: 4rem auto; display: flex; flex-direction: column; gap: var(--space-3); padding: 0 var(--space-4); }
    .login__logo { display: block; width: min(260px, 80%); height: auto; margin: 0 auto; }
    .login h1 { text-align: center; color: var(--color-primary); }
    form { display: flex; flex-direction: column; gap: var(--space-2); }
    .link { background: none; border: none; color: var(--color-primary); text-decoration: underline; align-self: center; padding: 0; cursor: pointer; }
    .btn--google { gap: 0.6rem; }
    .btn--google .btn__g { width: 18px; height: 18px; flex: 0 0 18px; }
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly model = signal<LoginModel>({ email: '', password: '' });
  protected readonly f = form(this.model, (path) => {
    required(path.email, { message: 'Email is required' });
    emailRule(path.email, { message: 'Enter a valid email address' });
    required(path.password, { message: 'Password is required' });
  });

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly submitted = signal(false);
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

  protected showError(touched: boolean, invalid: boolean): boolean {
    return (touched || this.submitted()) && invalid;
  }

  async login(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (this.f().invalid()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.loginEmail(this.model().email, this.model().password);
      await this.router.navigate(['/']);
    } catch {
      this.error.set('Incorrect email or password.');
    } finally {
      this.busy.set(false);
    }
  }

  async google(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.loginGoogle();
      await this.router.navigate(['/']);
    } catch (err) {
      const code = (err as { code?: string }).code;
      this.error.set(
        code === 'auth/account-exists-with-different-credential'
          ? 'This email uses a password. Sign in with your password below.'
          : 'Google sign-in was cancelled or failed.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  async forgot(): Promise<void> {
    const email = this.model().email.trim();
    if (!email) {
      this.error.set('Enter your email above, then tap “Forgot password?”.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.reset(email);
      this.resetSent.set(true);
    } catch {
      this.error.set('Could not send a reset email to that address.');
    } finally {
      this.busy.set(false);
    }
  }
}
