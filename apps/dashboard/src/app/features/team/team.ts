import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormField, email as emailRule, form, required } from '@angular/forms/signals';
import { PhoneTakenError, isValidPhPhone, toCanonical } from '@exodus/shared';
import { ProvisioningService } from '../../auth/provisioning.service';

interface TeamModel {
  name: string;
  email: string;
  phone: string;
  role: 'staff' | 'rider';
}

const EMPTY: TeamModel = { name: '', email: '', phone: '', role: 'staff' };

@Component({
  selector: 'app-team',
  imports: [FormField, RouterLink],
  template: `
    <main class="team">
      <a routerLink="/">← Back</a>
      <h1>Create staff / rider</h1>

      <form class="card" (submit)="create($event)" novalidate>
        <label for="name">Full name</label>
        <input id="name" type="text" [formField]="f.name" [attr.aria-invalid]="err(f.name().touched(), f.name().invalid())" />
        @if (err(f.name().touched(), f.name().invalid())) {
          <p class="field-error" role="alert">{{ f.name().errors()[0]?.message }}</p>
        }

        <label for="email">Email</label>
        <input id="email" type="email" [formField]="f.email" [attr.aria-invalid]="err(f.email().touched(), f.email().invalid())" />
        @if (err(f.email().touched(), f.email().invalid())) {
          <p class="field-error" role="alert">{{ f.email().errors()[0]?.message }}</p>
        }

        <label for="phone">Phone (e.g. 0917 123 4567)</label>
        <input id="phone" type="tel" [formField]="f.phone" [attr.aria-invalid]="phoneError() !== null" />
        @if (phoneError()) {
          <p class="field-error" role="alert">{{ phoneError() }}</p>
        }

        <label for="role">Role</label>
        <select id="role" [formField]="f.role">
          <option value="staff">Staff (dashboard)</option>
          <option value="rider">Rider (mobile app)</option>
        </select>

        @if (error()) {
          <p class="banner banner--error" role="alert">{{ error() }}</p>
        }
        @if (createdMsg()) {
          <p class="banner banner--ok" role="status">{{ createdMsg() }}</p>
        }

        <button type="submit" class="btn btn--primary" [disabled]="busy()">Create account</button>
      </form>
    </main>
  `,
  styles: `
    .team { max-width: 26rem; margin: var(--space-6) auto; display: flex; flex-direction: column; gap: var(--space-3); padding: 0 var(--space-4); }
    form { display: flex; flex-direction: column; gap: var(--space-2); }
  `,
})
export class TeamComponent {
  private readonly provisioning = inject(ProvisioningService);

  protected readonly model = signal<TeamModel>({ ...EMPTY });
  protected readonly f = form(this.model, (path) => {
    required(path.name, { message: 'Name is required' });
    required(path.email, { message: 'Email is required' });
    emailRule(path.email, { message: 'Enter a valid email address' });
    required(path.phone, { message: 'Phone is required' });
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdMsg = signal<string | null>(null);
  protected readonly phoneError = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected err(touched: boolean, invalid: boolean): boolean {
    return (touched || this.submitted()) && invalid;
  }

  async create(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    this.error.set(null);
    this.createdMsg.set(null);
    this.phoneError.set(null);

    const value = this.model();
    // Signal Forms covers name/email/required-phone; validate phone FORMAT here.
    if (!isValidPhPhone(safeCanonical(value.phone))) {
      this.phoneError.set('Enter a valid PH mobile number.');
    }
    if (this.f().invalid() || this.phoneError()) {
      return;
    }

    this.busy.set(true);
    try {
      await this.provisioning.createStaffOrRider({
        name: value.name.trim(),
        email: value.email.trim(),
        phoneRaw: value.phone,
        role: value.role,
      });
      this.createdMsg.set(
        `${value.role === 'staff' ? 'Staff' : 'Rider'} account created. A password-setup email was sent to ${value.email}.`,
      );
      this.model.set({ ...EMPTY });
      this.submitted.set(false);
    } catch (err) {
      if (err instanceof PhoneTakenError) {
        this.phoneError.set('That phone number is already registered.');
      } else if ((err as { code?: string }).code === 'auth/email-already-in-use') {
        this.error.set('That email already has an account.');
      } else {
        this.error.set('Could not create the account. Please try again.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}

function safeCanonical(raw: string): string {
  try {
    return toCanonical(raw);
  } catch {
    return '';
  }
}
