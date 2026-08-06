import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { serviceLabel, statusLabel, type OrderWithId } from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';

@Component({
  selector: 'app-order-detail',
  imports: [
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Order</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loading()) {
        <p>Loading…</p>
      } @else if (order(); as o) {
        <h1>{{ o.claimNumber }}</h1>
        <ion-list>
          <ion-item>
            <ion-label>Service</ion-label>
            <ion-note slot="end">{{ serviceLabel(o.service) }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>Status</ion-label>
            <ion-note slot="end">{{ statusLabel(o.status) }}</ion-note>
          </ion-item>
          @if (o.intakeMethod !== null) {
            <ion-item>
              <ion-label>Intake</ion-label>
              <ion-note slot="end">
                {{ o.intakeMethod === 'pickup' ? 'Pickup requested' : 'Drop-off' }}
              </ion-note>
            </ion-item>
          }
          <ion-item>
            <ion-label>Weight</ion-label>
            <ion-note slot="end">{{ o.weightKg !== null ? o.weightKg + ' kg' : 'pending' }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>Price</ion-label>
            <ion-note slot="end">{{ o.price !== null ? '₱' + o.price : 'pending' }}</ion-note>
          </ion-item>
          @if (o.notes) {
            <ion-item>
              <ion-label>Notes</ion-label>
              <ion-note slot="end">{{ o.notes }}</ion-note>
            </ion-item>
          }
        </ion-list>

        @if (o.status === 'ready' && o.fulfilment === null) {
          <div class="choice">
            <h2>How would you like to get it back?</h2>
            <ion-button expand="block" (click)="deliver(o.id)">Deliver to me</ion-button>
            <ion-button
              expand="block"
              fill="outline"
              [disabled]="busy()"
              (click)="pickup(o.id)"
            >
              Pick up at the shop
            </ion-button>
          </div>
        } @else if (o.fulfilment === 'pickup') {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">You chose pickup — collect it at the shop counter.</ion-label>
          </ion-item>
        } @else if (o.fulfilment === 'delivery') {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <h3>Delivery set</h3>
              @if (o.destination?.addressNote; as note) {
                <p>{{ note }}</p>
              }
            </ion-label>
          </ion-item>
        }

        <h2>Status history</h2>
        <ion-list>
          @for (h of o.statusHistory; track $index) {
            <ion-item>
              <ion-label>{{ statusLabel(h.status) }}</ion-label>
              <ion-note slot="end">{{ h.at.toDate() | date: 'MMM d, h:mm a' }}</ion-note>
            </ion-item>
          }
        </ion-list>
      } @else {
        <p role="alert">Order not found.</p>
      }
    </ion-content>
  `,
})
export class OrderDetailPage {
  private readonly store = inject(OrdersStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    const unsub = this.store.watch(id, (o) => {
      this.order.set(o);
      this.loading.set(false);
    });
    this.destroyRef.onDestroy(unsub);
  }

  /** Open the full-screen delivery map/pin flow. */
  deliver(id: string): void {
    void this.router.navigate(['/orders', id, 'deliver']);
  }

  /** Confirm, then mark the order for shop pickup (stays 'ready'; staff complete it). */
  async pickup(id: string): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Pick up at the shop?',
      message: 'You’ll collect your laundry at the shop counter.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Confirm', handler: () => void this.doPickup(id) },
      ],
    });
    await alert.present();
  }

  private async doPickup(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.choosePickup(id);
    } finally {
      this.busy.set(false);
    }
  }
}
