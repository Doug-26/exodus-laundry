import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-rider-home',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Rider</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p>Welcome, {{ auth.profile()?.name }}.</p>
      <p>Your assigned deliveries will appear here (coming in a later phase).</p>
      <ion-button expand="block" fill="outline" (click)="logout()">Sign out</ion-button>
    </ion-content>
  `,
})
export class RiderHomePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
