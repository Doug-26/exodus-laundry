import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
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
  private readonly destroyRef = inject(DestroyRef);

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly loading = signal(true);
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
}
