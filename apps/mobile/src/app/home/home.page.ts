import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, shirtOutline } from 'ionicons/icons';
import { serviceLabel, statusLabel, statusTone, type OrderWithId } from '@exodus/shared';
import { AuthService } from '../auth/auth.service';
import { OrdersStore } from '../orders/orders.store';

/** Date presets for the order list. 'all' is the default so nothing is hidden. */
type RangeKey = 'all' | 'today' | '7d' | 'month' | 'custom';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonInput,
    IonSegment,
    IonSegmentButton,
    IonAvatar,
  ],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(OrdersStore);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;

  protected readonly range = signal<RangeKey>('all');
  protected readonly customStart = signal('');
  protected readonly customEnd = signal('');

  /** First name only — "Hi, Juan" reads better than the full registered name. */
  protected readonly greeting = computed(() => {
    const first = this.auth.profile()?.name?.trim().split(/\s+/)[0];
    return first ? `Hi, ${first}` : 'Hi there';
  });
  /** The saved profile picture, or the neutral placeholder when none is set. */
  protected readonly avatarSrc = computed(
    () => this.auth.profile()?.photoUrl ?? 'assets/logo/avatar-default.svg',
  );

  /**
   * The store already holds every order for this customer (active + history), so
   * the date filter is a pure client-side narrowing — no extra Firestore read.
   */
  protected readonly filteredOrders = computed<OrderWithId[]>(() => {
    const all = this.store.orders();
    const bounds = this.bounds();
    if (!bounds) {
      return all;
    }
    const [startMs, endMs] = bounds;
    return all.filter((o) => {
      const ms = o.createdAt?.toMillis();
      // A just-placed order has no server timestamp yet — never hide it.
      return ms == null || (ms >= startMs && ms <= endMs);
    });
  });

  constructor() {
    addIcons({ addOutline, shirtOutline });
    const uid = this.auth.firebaseUser()?.uid;
    if (uid) {
      this.store.connect(uid);
    }
  }

  protected onRange(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>).detail.value;
    if (value) {
      this.range.set(value as RangeKey);
    }
  }

  protected onCustomDate(which: 'start' | 'end', event: Event): void {
    const value = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    // <input type="date"> gives YYYY-MM-DD; keep just that if a full ISO string arrives.
    const day = value.slice(0, 10);
    if (which === 'start') {
      this.customStart.set(day);
    } else {
      this.customEnd.set(day);
    }
  }

  /** [startMs, endMs] for the current selection; null means "no filter". */
  private bounds(): [number, number] | null {
    const key = this.range();
    if (key === 'all') {
      return null;
    }
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endMs = now.getTime();
    switch (key) {
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
        return [
          new Date(this.customStart() + 'T00:00:00').getTime(),
          new Date(this.customEnd() + 'T23:59:59.999').getTime(),
        ];
      }
    }
  }
}
