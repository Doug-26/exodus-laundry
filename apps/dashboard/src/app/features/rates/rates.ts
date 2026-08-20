import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SERVICES, serviceLabel, type Rate } from '@exodus/shared';
import { RatesStore } from '../../rates/rates.store';

interface RateDraft {
  baseKg: number;
  baseAmount: number;
  perKg: number;
  active: boolean;
}

@Component({
  selector: 'app-rates',
  imports: [RouterLink],
  template: `
    <main class="rates">
      <a routerLink="/">← Queue</a>
      <h1>Manage rates</h1>
      <p class="hint">
        Prices auto-fill the amount at intake — staff can still adjust per order. The
        <strong>base price</strong> covers up to the <strong>base kg</strong>; each kg above adds the
        <strong>₱/kg</strong>. For a flat per-order price, set base kg to 0 and ₱/kg to 0.
      </p>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Service</th><th>Base (kg)</th><th>Base price (₱)</th><th>₱ / kg above</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (s of services; track s.id) {
              <tr>
                <th scope="row">{{ s.label }}</th>
                <td>
                  <input type="number" step="0.5" min="0" [value]="value(s.id).baseKg"
                         (input)="edit(s.id, 'baseKg', $event)" [attr.aria-label]="'Base kg for ' + s.label" />
                </td>
                <td>
                  <input type="number" step="1" min="0" [value]="value(s.id).baseAmount"
                         (input)="edit(s.id, 'baseAmount', $event)" [attr.aria-label]="'Base price for ' + s.label" />
                </td>
                <td>
                  <input type="number" step="1" min="0" [value]="value(s.id).perKg"
                         (input)="edit(s.id, 'perKg', $event)" [attr.aria-label]="'Price per kg above base for ' + s.label" />
                </td>
                <td>
                  <input type="checkbox" [checked]="value(s.id).active"
                         (change)="edit(s.id, 'active', $event)" [attr.aria-label]="'Active for ' + s.label" />
                </td>
                <td>
                  <button type="button" class="btn btn--primary" [disabled]="savingFor() === s.id" (click)="save(s.id)">
                    {{ savingFor() === s.id ? 'Saving…' : 'Save' }}
                  </button>
                  @if (savedFor() === s.id) {
                    <span class="saved" role="status">Saved.</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </main>
  `,
  styles: `
    .rates { max-width: 56rem; margin: var(--space-6) auto; padding: 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    h1 { margin: 0; }
    .hint { color: var(--color-muted); margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    thead th { color: var(--color-muted); font-size: 0.85rem; }
    td input[type='number'] { width: 5.5rem; }
    .saved { color: var(--color-success); margin-left: 0.5rem; }
  `,
})
export class RatesComponent {
  private readonly store = inject(RatesStore);
  protected readonly services = SERVICES;
  protected readonly serviceLabel = serviceLabel;

  // Only edited rows live here; unedited rows read straight from the live rate.
  private readonly drafts = signal<Record<string, RateDraft>>({});
  protected readonly savingFor = signal<string | null>(null);
  protected readonly savedFor = signal<string | null>(null);

  constructor() {
    this.store.connect();
  }

  /** Current editable values for a service: the in-progress draft, else the live rate, else defaults. */
  protected value(serviceId: string): RateDraft {
    const draft = this.drafts()[serviceId];
    if (draft) {
      return draft;
    }
    const r = this.store.byService()[serviceId];
    return r
      ? { baseKg: r.baseKg, baseAmount: r.baseAmount, perKg: r.perKg, active: r.active }
      : { baseKg: 0, baseAmount: 0, perKg: 0, active: true };
  }

  protected edit(serviceId: string, field: keyof RateDraft, event: Event): void {
    const el = event.target as HTMLInputElement;
    const current = this.value(serviceId);
    const next: RateDraft =
      field === 'active'
        ? { ...current, active: el.checked }
        : { ...current, [field]: Math.max(0, Number(el.value) || 0) };
    this.drafts.update((m) => ({ ...m, [serviceId]: next }));
    if (this.savedFor() === serviceId) {
      this.savedFor.set(null);
    }
  }

  protected async save(serviceId: string): Promise<void> {
    const rate: Rate = { service: serviceId, ...this.value(serviceId) };
    this.savingFor.set(serviceId);
    this.savedFor.set(null);
    try {
      await this.store.save(rate);
      this.savedFor.set(serviceId);
    } finally {
      this.savingFor.set(null);
    }
  }
}
