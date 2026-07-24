import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {}
