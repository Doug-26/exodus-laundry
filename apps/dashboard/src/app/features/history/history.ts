import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { serviceLabel, statusLabel, statusTone, type OrderWithId } from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';

type Preset = 'today' | '7d' | 'month' | 'custom';

@Component({
  selector: 'app-history',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="history">
      <a routerLink="/">← Queue</a>
      <h1>Order history</h1>
      <p class="hint">
        All orders <strong>created</strong> in the selected period — any status, including
        completed and cancelled. The queue only shows active orders.
      </p>

      <div class="controls">
        <div class="presets" role="group" aria-label="Date range">
          <button type="button" class="btn" [class.btn--primary]="preset() === 'today'" [class.btn--ghost]="preset() !== 'today'" (click)="setPreset('today')">Today</button>
          <button type="button" class="btn" [class.btn--primary]="preset() === '7d'" [class.btn--ghost]="preset() !== '7d'" (click)="setPreset('7d')">Last 7 days</button>
          <button type="button" class="btn" [class.btn--primary]="preset() === 'month'" [class.btn--ghost]="preset() !== 'month'" (click)="setPreset('month')">This month</button>
        </div>
        <div class="custom">
          <label for="from">From</label>
          <input id="from" type="date" [value]="customStart()" (change)="onCustom('start', $event)" />
          <label for="to">To</label>
          <input id="to" type="date" [value]="customEnd()" (change)="onCustom('end', $event)" />
        </div>
      </div>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="banner banner--error" role="alert">{{ error() }}</p>
      } @else {
        <p class="count" role="status">
          {{ orders().length }} {{ orders().length === 1 ? 'order' : 'orders' }}
        </p>

        @if (orders().length === 0) {
          <p class="empty">No orders were created in this period.</p>
        } @else {
          <table>
            <caption class="sr-only">Orders created in the selected period</caption>
            <thead>
              <tr>
                <th scope="col">Claim #</th>
                <th scope="col">Customer</th>
                <th scope="col">Service</th>
                <th scope="col">Status</th>
                <th scope="col">Price</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (o of orders(); track o.id) {
                <tr>
                  <td><a [routerLink]="['/orders', o.id]">{{ o.claimNumber }}</a></td>
                  <td>
                    {{ o.guestContact?.name }}
                    @if (o.source === 'app') {
                      <span class="badge badge--app">App</span>
                    } @else if (o.customerId !== null) {
                      <span class="badge badge--linked">Linked</span>
                    } @else {
                      <span class="badge badge--walkin">Walk-in</span>
                    }
                    <span class="phone">{{ o.guestContact?.phone }}</span>
                  </td>
                  <td>{{ serviceLabel(o.service) }}</td>
                  <td><span class="status tone-{{ statusTone(o.status) }}">{{ statusLabel(o.status) }}</span></td>
                  <td>{{ o.price !== null ? '₱' + o.price : '—' }}</td>
                  <td>{{ o.createdAt ? (o.createdAt.toDate() | date: 'MMM d, y · h:mm a') : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </main>
  `,
  styles: `
    .history { max-width: 64rem; margin: var(--space-6) auto; padding: 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    h1 { margin: 0; }
    .hint { color: var(--color-muted); margin: 0; }
    .controls { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; }
    .presets { display: flex; gap: var(--space-2); }
    .custom { display: flex; gap: var(--space-2); align-items: center; color: var(--color-muted); font-size: 0.9rem; }
    .count { margin: 0; color: var(--color-muted); font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    thead th { background: var(--color-bg); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-muted); }
    th, td { text-align: left; padding: 0.7rem var(--space-4); border-bottom: 1px solid var(--color-border); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--color-bg); }
    .phone { display: block; color: var(--color-muted); font-size: 0.82rem; }
    .empty { padding: var(--space-8) var(--space-5); color: var(--color-muted); text-align: center; }
  `,
})
export class HistoryComponent {
  private readonly store = inject(OrdersStore);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;

  // 'today' would show almost nothing on a history screen, so this opens on the week.
  protected readonly preset = signal<Preset>('7d');
  protected readonly customStart = signal('');
  protected readonly customEnd = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly rows = signal<OrderWithId[]>([]);

  /** Newest first — history reads backwards from now (the queue is oldest-first). */
  protected readonly orders = computed<OrderWithId[]>(() =>
    [...this.rows()].sort(
      (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
    ),
  );

  constructor() {
    void this.load();
  }

  protected setPreset(p: Preset): void {
    this.preset.set(p);
    void this.load();
  }

  protected onCustom(which: 'start' | 'end', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (which === 'start') {
      this.customStart.set(value);
    } else {
      this.customEnd.set(value);
    }
    this.preset.set('custom');
    if (this.customStart() && this.customEnd()) {
      void this.load();
    }
  }

  /** [startMs, endMs] for the current selection, or null if custom is incomplete. */
  private range(): [number, number] | null {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endMs = now.getTime();
    switch (this.preset()) {
      case 'today':
        return [startOfDay(now), endMs];
      case '7d':
        return [startOfDay(now) - 6 * 86_400_000, endMs];
      case 'month':
        return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endMs];
      case 'custom': {
        if (!this.customStart() || !this.customEnd()) {
          return null;
        }
        const s = new Date(this.customStart() + 'T00:00:00').getTime();
        const e = new Date(this.customEnd() + 'T23:59:59.999').getTime();
        return [s, e];
      }
    }
  }

  private async load(): Promise<void> {
    const range = this.range();
    if (!range) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.store.ordersInRange(range[0], range[1]));
    } catch {
      this.error.set('Could not load the history. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
