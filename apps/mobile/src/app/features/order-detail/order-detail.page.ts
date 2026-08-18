import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, locateOutline, navigateOutline, storefrontOutline } from 'ionicons/icons';
import { serviceLabel, statusLabel, statusTone, type OrderWithId } from '@exodus/shared';
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
    IonIcon,
    IonCard,
    IonCardContent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Order</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loading()) {
        <div class="loading"><ion-spinner name="crescent"></ion-spinner></div>
      } @else if (order(); as o) {
        <div class="order-head">
          <h1>{{ o.claimNumber }}</h1>
          <span class="status-chip tone-{{ statusTone(o.status) }}">{{ statusLabel(o.status) }}</span>
        </div>

        <ion-card>
          <ion-list lines="full">
            <ion-item>
              <ion-label>Service</ion-label>
              <ion-note slot="end">{{ serviceLabel(o.service) }}</ion-note>
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
              <ion-note slot="end">{{ o.weightKg !== null ? o.weightKg + ' kg' : 'Pending' }}</ion-note>
            </ion-item>
            <ion-item [lines]="o.notes ? 'full' : 'none'">
              <ion-label>Price</ion-label>
              <ion-note slot="end">{{ o.price !== null ? '₱' + o.price : 'Pending' }}</ion-note>
            </ion-item>
            @if (o.notes) {
              <ion-item lines="none">
                <ion-label>Notes</ion-label>
                <ion-note slot="end">{{ o.notes }}</ion-note>
              </ion-item>
            }
          </ion-list>
        </ion-card>

        @if (o.status === 'ready' && o.fulfilment === null) {
          <h2 class="section-title">How would you like to get it back?</h2>
          <div class="choice">
            <ion-button expand="block" (click)="deliver(o.id)">
              <ion-icon name="navigate-outline" slot="start"></ion-icon>
              Deliver to me
            </ion-button>
            <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="pickup(o.id)">
              <ion-icon name="storefront-outline" slot="start"></ion-icon>
              Pick up at the shop
            </ion-button>
          </div>
        } @else if (o.fulfilment === 'pickup') {
          <ion-card class="fulfil">
            <ion-card-content>
              <div class="fulfil__title">
                <ion-icon name="storefront-outline"></ion-icon> Pickup
              </div>
              <p>You chose pickup — collect it at the shop counter.</p>
            </ion-card-content>
          </ion-card>
        } @else if (o.fulfilment === 'delivery') {
          <ion-card class="fulfil">
            <ion-card-content>
              <div class="fulfil__title">
                <ion-icon name="navigate-outline"></ion-icon> Delivery set
              </div>
              @if (o.destination?.addressNote; as note) {
                <p>{{ note }}</p>
              }
              @if (o.status === 'out_for_delivery') {
                <ion-button expand="block" (click)="track(o.id)">
                  <ion-icon name="locate-outline" slot="start"></ion-icon>
                  Track your delivery
                </ion-button>
              }
            </ion-card-content>
          </ion-card>
        }

        <h2 class="section-title">Status history</h2>
        <ion-card>
          <ion-list lines="full">
            @for (h of o.statusHistory; track $index) {
              <ion-item [lines]="$last ? 'none' : 'full'">
                <ion-label>{{ statusLabel(h.status) }}</ion-label>
                <ion-note slot="end">{{ h.at.toDate() | date: 'MMM d, h:mm a' }}</ion-note>
              </ion-item>
            }
          </ion-list>
        </ion-card>
      } @else {
        <div class="empty-state">
          <ion-icon name="alert-circle-outline"></ion-icon>
          <h2>Order not found</h2>
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      .order-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-space-3);
        margin: var(--app-space-2) 0 var(--app-space-4);
      }
      .order-head h1 {
        margin: 0;
        font-size: 1.6rem;
        font-weight: 700;
      }
      ion-card {
        margin-inline: 0;
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-sm);
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: var(--app-space-7) 0;
      }
      .choice {
        display: flex;
        flex-direction: column;
        gap: var(--app-space-2);
        margin-bottom: var(--app-space-4);
      }
      .fulfil ion-card-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: var(--ion-text-color);
      }
      .fulfil__title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
      }
      .fulfil ion-icon {
        color: var(--ion-color-primary);
        font-size: 1.15rem;
      }
      .fulfil p {
        margin: 0;
        color: var(--ion-color-medium);
      }
    `,
  ],
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
  protected readonly statusTone = statusTone;

  constructor() {
    addIcons({ alertCircleOutline, locateOutline, navigateOutline, storefrontOutline });
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

  /** Open the live tracking map for an out-for-delivery order. */
  track(id: string): void {
    void this.router.navigate(['/orders', id, 'track']);
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
