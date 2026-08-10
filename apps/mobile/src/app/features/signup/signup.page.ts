import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personAddOutline, sparklesOutline } from 'ionicons/icons';
import { PhoneTakenError, isValidPhPhone, toCanonical } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { homeRouteForRole } from '../../auth/role-routes';

function phoneValidator(control: AbstractControl): ValidationErrors | null {
  const raw = (control.value as string) ?? '';
  if (!raw) {
    return null; // `required` reports the empty case
  }
  try {
    return isValidPhPhone(toCanonical(raw)) ? null : { phone: true };
  } catch {
    return { phone: true };
  }
}

@Component({
  selector: 'app-signup',
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
    IonIcon,
    IonNote,
    IonText,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Create account</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="auth-hero">
        <ion-icon name="sparkles-outline"></ion-icon>
        <h1>Join Exodus Laundry</h1>
        <p>Track orders and get delivery to your door.</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()">
        <ion-list>
          <ion-item>
            <ion-input label="Full name" labelPlacement="stacked" type="text" formControlName="name"></ion-input>
          </ion-item>
          @if (invalid('name')) {
            <ion-note color="danger" role="alert">Name is required.</ion-note>
          }

          <ion-item>
            <ion-input label="Email" labelPlacement="stacked" type="email" autocomplete="email" formControlName="email"></ion-input>
          </ion-item>
          @if (invalid('email')) {
            <ion-note color="danger" role="alert">Enter a valid email.</ion-note>
          }

          <ion-item>
            <ion-input
              label="Mobile number"
              labelPlacement="stacked"
              type="tel"
              inputmode="tel"
              placeholder="0917 123 4567"
              formControlName="phone"
            ></ion-input>
          </ion-item>
          @if (invalid('phone')) {
            <ion-note color="danger" role="alert">Enter a valid PH mobile number.</ion-note>
          } @else if (canonicalPreview()) {
            <ion-note color="medium">Saved as {{ canonicalPreview() }}</ion-note>
          }

          <ion-item>
            <ion-input
              label="Password"
              labelPlacement="stacked"
              type="password"
              autocomplete="new-password"
              formControlName="password"
            ></ion-input>
          </ion-item>
          @if (invalid('password')) {
            <ion-note color="danger" role="alert">Password must be at least 6 characters.</ion-note>
          }
        </ion-list>

        @if (error()) {
          <ion-text color="danger"><p role="alert">{{ error() }}</p></ion-text>
        }

        <ion-button expand="block" type="submit" [disabled]="busy()">
          <ion-icon name="person-add-outline" slot="start"></ion-icon>
          Create account
        </ion-button>
      </form>

      <ion-button expand="block" fill="clear" routerLink="/login" [disabled]="busy()">
        I already have an account
      </ion-button>
    </ion-content>
  `,
  styles: [
    `
      .auth-hero {
        text-align: center;
        margin: var(--app-space-4) 0 var(--app-space-5);
      }
      .auth-hero ion-icon {
        font-size: 2.5rem;
        color: var(--ion-color-primary);
      }
      .auth-hero h1 {
        margin: var(--app-space-2) 0 0;
        font-size: 1.5rem;
        font-weight: 700;
      }
      .auth-hero p {
        margin: 2px 0 0;
        color: var(--ion-color-medium);
      }
    `,
  ],
})
export class SignupPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required, phoneValidator]),
    password: this.fb.control('', [Validators.required, Validators.minLength(6)]),
  });

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    addIcons({ personAddOutline, sparklesOutline });
  }

  private readonly phoneValue = toSignal(this.form.controls.phone.valueChanges, { initialValue: '' });
  protected readonly canonicalPreview = computed(() => {
    try {
      return toCanonical(this.phoneValue());
    } catch {
      return '';
    }
  });

  protected invalid(name: 'name' | 'email' | 'phone' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { name, email, phone, password } = this.form.getRawValue();
    try {
      await this.auth.signupCustomer({ name: name.trim(), email: email.trim(), password, phoneRaw: phone });
      await this.router.navigateByUrl(homeRouteForRole('customer'));
    } catch (err) {
      if (err instanceof PhoneTakenError) {
        this.error.set('That mobile number is already registered.');
      } else if ((err as { code?: string }).code === 'auth/email-already-in-use') {
        this.error.set('That email already has an account. Try signing in.');
      } else {
        this.error.set('Could not create your account. Please try again.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
