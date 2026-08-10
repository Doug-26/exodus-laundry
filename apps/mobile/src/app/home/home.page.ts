import { DatePipe } from '@angular/common';
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
import { addOutline, shirtOutline, sparklesOutline } from 'ionicons/icons';
import { serviceLabel, statusLabel, statusTone } from '@exodus/shared';
import { AuthService } from '../auth/auth.service';
import { OrdersStore } from '../orders/orders.store';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonButtons,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
  ],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(OrdersStore);
  private readonly router = inject(Router);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;

  constructor() {
    addIcons({ addOutline, shirtOutline, sparklesOutline });
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
