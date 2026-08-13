import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bicycleOutline, checkmarkCircleOutline, navigateOutline } from 'ionicons/icons';
import { serviceLabel, statusLabel, statusTone } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { RiderOrdersStore } from '../../orders/rider-orders.store';

@Component({
  selector: 'app-rider-home',
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>
          <span class="brand"><ion-icon name="bicycle-outline"></ion-icon> Deliveries</span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="logout()">Sign out</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (store.mine().length > 0) {
        <h2 class="section-title">Out for delivery</h2>
        <ion-list lines="none">
          @for (o of store.mine(); track o.id) {
            <ion-item button [routerLink]="['/rider/delivery', o.id]" detail="true" class="delivery-card">
              <ion-icon name="navigate-outline" slot="start" color="primary"></ion-icon>
              <ion-label>
                <h2>{{ o.claimNumber }}</h2>
                <p>{{ o.destination?.addressNote || 'Tap to view route' }}</p>
              </ion-label>
              <span class="status-chip tone-{{ statusTone(o.status) }}" slot="end">
                {{ statusLabel(o.status) }}
              </span>
            </ion-item>
          }
        </ion-list>
      }

      <h2 class="section-title">Available</h2>
      @if (store.available().length === 0) {
        <div class="empty-state">
          <ion-icon name="checkmark-circle-outline"></ion-icon>
          <h2>All caught up</h2>
          <p>No deliveries waiting to be picked up right now.</p>
        </div>
      } @else {
        <ion-list lines="none">
          @for (o of store.available(); track o.id) {
            <ion-item button [routerLink]="['/rider/delivery', o.id]" detail="true" class="delivery-card">
              <ion-label>
                <h2>{{ o.claimNumber }}</h2>
                <p>{{ serviceLabel(o.service) }}</p>
                @if (o.destination?.addressNote; as note) {
                  <p>{{ note }}</p>
                }
              </ion-label>
              <ion-note slot="end">Start →</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [
    `
      .delivery-card {
        --border-radius: var(--app-radius-md);
        --padding-top: 12px;
        --padding-bottom: 12px;
        margin-bottom: var(--app-space-3);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-sm);
      }
      .delivery-card h2 {
        margin: 0;
        font-weight: 700;
        font-size: 1rem;
      }
      .delivery-card p {
        margin: 0;
        color: var(--ion-color-medium);
      }
    `,
  ],
})
export class RiderHomePage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(RiderOrdersStore);
  private readonly router = inject(Router);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;

  constructor() {
    addIcons({ bicycleOutline, checkmarkCircleOutline, navigateOutline });
    const uid = this.auth.firebaseUser()?.uid;
    if (uid) {
      this.store.connect(uid);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
