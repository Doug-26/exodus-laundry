import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { Order } from '@exodus/shared';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('dashboard');
  // type-only import verifies @exodus/shared path alias is wired
  declare private _order: Order;
}
