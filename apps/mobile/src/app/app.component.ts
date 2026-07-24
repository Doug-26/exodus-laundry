import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import type { User } from '@exodus/shared';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  // type-only import verifies @exodus/shared path alias is wired
  declare private _user: User;
}
