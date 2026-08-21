import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { serviceLabel, type RevenueSummary } from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';

type Preset = 'today' | '7d' | 'month' | 'custom';

@Component({
  selector: 'app-reports',
  imports: [RouterLink],
  template: `
    <main class="reports">
      <a routerLink="/">← Queue</a>
      <h1>Revenue reports</h1>
      <p class="hint">Revenue from orders <strong>completed</strong> in the selected period.</p>

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
      } @else if (summary(); as s) {
        <div class="cards">
          <div class="card stat"><span class="label">Revenue</span><span class="value">₱{{ s.totalRevenue }}</span></div>
          <div class="card stat"><span class="label">Completed orders</span><span class="value">{{ s.completedCount }}</span></div>
          <div class="card stat"><span class="label">Average / order</span><span class="value">₱{{ s.avg }}</span></div>
        </div>

        <div class="card">
          <h2>By service</h2>
          @if (serviceRows().length === 0) {
            <p class="empty">No completed orders in this period.</p>
          } @else {
            <table>
              <thead><tr><th>Service</th><th>Orders</th><th>Revenue</th></tr></thead>
              <tbody>
                @for (r of serviceRows(); track r.service) {
                  <tr><th scope="row">{{ serviceLabel(r.service) }}</th><td>{{ r.count }}</td><td>₱{{ r.revenue }}</td></tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </main>
  `,
  styles: `
    .reports { max-width: 48rem; margin: var(--space-6) auto; padding: 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    h1 { margin: 0; }
    h2 { margin: 0 0 var(--space-3); font-size: 1.05rem; }
    .hint { color: var(--color-muted); margin: 0; }
    .controls { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: end; }
    .presets { display: flex; gap: var(--space-2); }
    .custom { display: flex; gap: var(--space-2); align-items: center; color: var(--color-muted); font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
    .stat { display: flex; flex-direction: column; gap: 4px; }
    .stat .label { color: var(--color-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .stat .value { font-size: 1.6rem; font-weight: 700; color: var(--color-primary); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-border); }
    thead th { color: var(--color-muted); font-size: 0.8rem; }
    tbody td { text-align: left; }
    .empty { color: var(--color-muted); margin: 0; }
    @media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
  `,
})
export class ReportsComponent {
  private readonly store = inject(OrdersStore);
  protected readonly serviceLabel = serviceLabel;

  protected readonly preset = signal<Preset>('today');
  protected readonly customStart = signal('');
  protected readonly customEnd = signal('');
  protected readonly summary = signal<RevenueSummary | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly serviceRows = computed(() =>
    Object.entries(this.summary()?.byService ?? {})
      .map(([service, v]) => ({ service, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
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
      this.summary.set(await this.store.revenueInRange(range[0], range[1]));
    } catch {
      this.error.set('Could not load the report. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
