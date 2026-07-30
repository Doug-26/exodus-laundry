import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, min, required } from '@angular/forms/signals';
import { SERVICES, isValidPhPhone, toCanonical } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { OrdersStore } from '../../orders/orders.store';
import { SHOP_LOCATION } from '../../shop.config';

interface NewOrderModel {
  name: string;
  phone: string;
  service: string;
  weightKg: number;
  price: number;
  notes: string;
}

const EMPTY: NewOrderModel = {
  name: '',
  phone: '',
  service: 'wash_fold',
  weightKg: 0,
  price: 0,
  notes: '',
};

@Component({
  selector: 'app-new-order',
  imports: [FormField, RouterLink],
  template: `
    <main class="intake">
      <a routerLink="/">← Queue</a>
      <h1>New Order</h1>

      <form (submit)="submit($event)" novalidate>
        <label for="name">Customer name</label>
        <input id="name" type="text" autocomplete="name" [formField]="f.name"
               [attr.aria-invalid]="err(f.name().touched(), f.name().invalid())" />
        @if (err(f.name().touched(), f.name().invalid())) {
          <p class="field-error" role="alert">{{ f.name().errors()[0]?.message }}</p>
        }

        <label for="phone">Mobile number</label>
        <input id="phone" type="tel" inputmode="tel" placeholder="0917 123 4567" [formField]="f.phone"
               [attr.aria-invalid]="phoneError() !== null" />
        @if (phoneError()) {
          <p class="field-error" role="alert">{{ phoneError() }}</p>
        }

        <label for="service">Service</label>
        <select id="service" [formField]="f.service">
          @for (s of services; track s.id) {
            <option [value]="s.id">{{ s.label }}</option>
          }
        </select>

        <label for="weight">Weight (kg)</label>
        <input id="weight" type="number" step="0.1" [formField]="f.weightKg"
               [attr.aria-invalid]="err(f.weightKg().touched(), f.weightKg().invalid())" />
        @if (err(f.weightKg().touched(), f.weightKg().invalid())) {
          <p class="field-error" role="alert">{{ f.weightKg().errors()[0]?.message }}</p>
        }

        <label for="price">Price (₱)</label>
        <input id="price" type="number" step="1" [formField]="f.price" />

        <label for="notes">Notes (optional)</label>
        <textarea id="notes" rows="2" [formField]="f.notes"></textarea>

        @if (error()) {
          <p class="banner banner--error" role="alert">{{ error() }}</p>
        }

        <button type="submit" [disabled]="busy()">Save order</button>
      </form>
    </main>
  `,
  styles: `
    .intake { max-width: 30rem; margin: 1.5rem auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0 1rem; }
    form { display: flex; flex-direction: column; gap: 0.5rem; }
    label { font-weight: 600; }
    input, select, textarea { padding: 0.6rem; font-size: 1rem; }
    button { padding: 0.75rem; font-size: 1.05rem; cursor: pointer; margin-top: 0.5rem; }
    .field-error { color: #b3261e; margin: 0; font-size: 0.85rem; }
    .banner { padding: 0.6rem; border-radius: 0.25rem; margin: 0; }
    .banner--error { background: #fce8e6; color: #b3261e; }
  `,
})
export class NewOrderComponent {
  private readonly auth = inject(AuthService);
  private readonly store = inject(OrdersStore);
  private readonly router = inject(Router);

  protected readonly services = SERVICES;
  protected readonly model = signal<NewOrderModel>({ ...EMPTY });
  protected readonly f = form(this.model, (path) => {
    required(path.name, { message: 'Customer name is required' });
    required(path.phone, { message: 'Mobile number is required' });
    min(path.weightKg, 0.1, { message: 'Enter the weight in kg' });
    min(path.price, 0, { message: 'Price cannot be negative' });
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly phoneError = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected err(touched: boolean, invalid: boolean): boolean {
    return (touched || this.submitted()) && invalid;
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    this.error.set(null);
    this.phoneError.set(null);

    const v = this.model();
    if (!isValidPhPhone(safeCanonical(v.phone))) {
      this.phoneError.set('Enter a valid PH mobile number.');
    }
    if (this.f().invalid() || this.phoneError()) {
      return;
    }

    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) {
      this.error.set('Your session expired. Please sign in again.');
      return;
    }

    this.busy.set(true);
    try {
      const { claimNumber } = await this.store.create({
        createdBy: uid,
        guestName: v.name.trim(),
        guestPhoneRaw: v.phone,
        service: v.service,
        weightKg: v.weightKg,
        loadCount: null,
        price: v.price,
        notes: v.notes.trim(),
        shopLocation: SHOP_LOCATION,
      });
      await this.router.navigate(['/'], { queryParams: { created: claimNumber } });
    } catch {
      this.error.set(
        navigator.onLine
          ? 'Could not create the order. Please try again.'
          : 'You appear to be offline — new orders need a connection (the queue still works offline).',
      );
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
