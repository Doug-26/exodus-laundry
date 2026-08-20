import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, min, required } from '@angular/forms/signals';
import { SERVICES, SHOP_LOCATION, isValidPhPhone, serviceLabel, toCanonical } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { OrdersStore } from '../../orders/orders.store';
import { RatesStore } from '../../rates/rates.store';

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

type LookupState = 'idle' | 'busy' | 'match' | 'nomatch';

@Component({
  selector: 'app-new-order',
  imports: [FormField, RouterLink],
  template: `
    <main class="intake">
      <a routerLink="/">← Queue</a>
      <h1>New Order</h1>

      <form class="card" (submit)="submit($event)" novalidate>
        <label for="phone">Mobile number</label>
        <div class="phone-row">
          <input
            id="phone"
            type="tel"
            inputmode="tel"
            placeholder="0917 123 4567"
            [formField]="f.phone"
            (input)="onPhoneInput()"
            [attr.aria-invalid]="phoneError() !== null"
          />
          <button type="button" class="btn btn--ghost" (click)="lookupAccount()" [disabled]="lookupState() === 'busy'">
            {{ lookupState() === 'busy' ? 'Looking up…' : 'Look up account' }}
          </button>
        </div>
        @if (phoneError()) {
          <p class="field-error" role="alert">{{ phoneError() }}</p>
        }
        @if (lookupState() === 'match') {
          <p class="banner banner--ok" role="status">Linked to {{ matchedName() }}'s account.</p>
        } @else if (lookupState() === 'nomatch') {
          <p class="banner banner--info" role="status">
            No app account for this number — it will be saved as a guest. Tip: have them install the
            app and register with this number, and their orders link automatically.
          </p>
        }

        <label for="name">Customer name</label>
        @if (linkedCustomerId() !== null) {
          <output id="name" class="readonly-name">{{ matchedName() }}</output>
        } @else {
          <input
            id="name"
            type="text"
            autocomplete="name"
            [formField]="f.name"
            [attr.aria-invalid]="err(f.name().touched(), f.name().invalid())"
          />
          @if (err(f.name().touched(), f.name().invalid())) {
            <p class="field-error" role="alert">{{ f.name().errors()[0]?.message }}</p>
          }
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
        <input id="price" type="number" step="1" [formField]="f.price" (input)="priceEdited.set(true)" />
        @if (!priceEdited() && suggestedPrice() !== null) {
          <p class="hint">Auto-filled from the {{ serviceLabel(model().service) }} rate — adjust if needed.</p>
        }

        <label for="notes">Notes (optional)</label>
        <textarea id="notes" rows="2" [formField]="f.notes"></textarea>

        @if (error()) {
          <p class="banner banner--error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn btn--primary" [disabled]="busy()">Save order</button>
      </form>
    </main>
  `,
  styles: `
    .intake { max-width: 32rem; margin: var(--space-6) auto; display: flex; flex-direction: column; gap: var(--space-3); padding: 0 var(--space-4); }
    form { display: flex; flex-direction: column; gap: var(--space-2); }
    .phone-row { display: flex; gap: var(--space-2); }
    .phone-row input { flex: 1; }
    .phone-row button { white-space: nowrap; }
    .readonly-name { display: block; padding: 0.55rem 0.7rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
    .hint { color: var(--color-muted); font-size: 0.85rem; margin: 0; }
    button[type='submit'] { margin-top: var(--space-2); }
  `,
})
export class NewOrderComponent {
  private readonly auth = inject(AuthService);
  private readonly store = inject(OrdersStore);
  private readonly rates = inject(RatesStore);
  private readonly router = inject(Router);

  protected readonly services = SERVICES;
  protected readonly serviceLabel = serviceLabel;
  protected readonly model = signal<NewOrderModel>({ ...EMPTY });

  /** True once staff types in the price field — stops auto-fill from overwriting it. */
  protected readonly priceEdited = signal(false);
  /** Suggested price from the active rate for the current service + weight. */
  protected readonly suggestedPrice = computed(() =>
    this.rates.suggest(this.model().service, this.model().weightKg > 0 ? this.model().weightKg : null),
  );
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

  protected readonly lookupState = signal<LookupState>('idle');
  protected readonly matchedName = signal<string | null>(null);
  protected readonly linkedCustomerId = signal<string | null>(null);

  constructor() {
    this.rates.connect();
    // Auto-fill the price from the rate whenever service/weight changes, unless
    // staff has manually edited it. Guarded write (untracked + ref-equality) so
    // it settles without looping.
    effect(() => {
      const suggestion = this.suggestedPrice();
      untracked(() => {
        if (suggestion !== null && !this.priceEdited()) {
          this.model.update((m) => (m.price === suggestion ? m : { ...m, price: suggestion }));
        }
      });
    });
  }

  protected err(touched: boolean, invalid: boolean): boolean {
    return (touched || this.submitted()) && invalid;
  }

  /** Changing the phone clears any established link. */
  protected onPhoneInput(): void {
    if (this.linkedCustomerId() !== null || this.lookupState() !== 'idle') {
      this.linkedCustomerId.set(null);
      this.matchedName.set(null);
      this.lookupState.set('idle');
    }
  }

  protected async lookupAccount(): Promise<void> {
    this.phoneError.set(null);
    const phone = this.model().phone;
    if (!isValidPhPhone(safeCanonical(phone))) {
      this.phoneError.set('Enter a valid PH mobile number.');
      return;
    }
    this.lookupState.set('busy');
    try {
      const match = await this.store.lookupCustomer(phone);
      if (match) {
        this.linkedCustomerId.set(match.uid);
        this.matchedName.set(match.name);
        this.model.update((m) => ({ ...m, name: match.name }));
        this.lookupState.set('match');
      } else {
        this.linkedCustomerId.set(null);
        this.matchedName.set(null);
        this.lookupState.set('nomatch');
      }
    } catch {
      this.lookupState.set('idle');
      this.phoneError.set('Lookup failed. Please try again.');
    }
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
        customerId: this.linkedCustomerId(),
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
