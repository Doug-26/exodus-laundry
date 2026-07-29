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
      <h1>Exodus Laundry — Staff</h1>

      @if (denied()) {
        <p class="banner banner--error" role="alert">
          This account can’t access the dashboard. Contact your administrator.
        </p>
      }

      <form (submit)="login($event)" novalidate>
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

        <button type="submit" [disabled]="busy()">Sign in</button>
      </form>

      <button type="button" class="google" (click)="google()" [disabled]="busy()">
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
    .login { max-width: 22rem; margin: 4rem auto; display: flex; flex-direction: column; gap: 0.75rem; padding: 0 1rem; }
    form { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-weight: 600; }
    input { padding: 0.6rem; font-size: 1rem; }
    button { padding: 0.65rem; font-size: 1rem; cursor: pointer; }
    .link { background: none; border: none; color: #0b57d0; text-decoration: underline; align-self: flex-start; padding: 0; }
    .field-error { color: #b3261e; margin: 0; font-size: 0.85rem; }
    .banner { padding: 0.6rem; border-radius: 0.25rem; margin: 0; }
    .banner--error { background: #fce8e6; color: #b3261e; }
    .banner--ok { background: #e6f4ea; color: #1e7e34; }
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
