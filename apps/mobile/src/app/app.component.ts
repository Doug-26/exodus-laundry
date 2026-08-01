import { Component, NgZone, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet, ToastController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly toast = inject(ToastController);

  ngOnInit(): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Tap on a delivered notification (app backgrounded/killed) → open the order.
    void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const orderId = action.notification.data?.['orderId'] as string | undefined;
      if (orderId) {
        this.zone.run(() => void this.router.navigate(['/orders', orderId]));
      }
    });

    // Push received while the app is foreground (no system tray) → in-app toast.
    void PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const orderId = notification.data?.['orderId'] as string | undefined;
      this.zone.run(() => void this.presentReadyToast(orderId));
    });
  }

  private async presentReadyToast(orderId?: string): Promise<void> {
    const toast = await this.toast.create({
      message: 'Your laundry is ready!',
      duration: 5000,
      position: 'top',
      buttons: orderId
        ? [{ text: 'View', handler: () => void this.router.navigate(['/orders', orderId]) }]
        : [],
    });
    await toast.present();
  }
}
