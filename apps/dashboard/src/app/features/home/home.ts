import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <header class="bar">
      <h1>Exodus Laundry</h1>
      <div class="who">
        <span>{{ auth.profile()?.name }} ({{ auth.role() }})</span>
        <button type="button" (click)="logout()">Sign out</button>
      </div>
    </header>

    <main>
      <p>Signed in. The order queue and intake arrive in Phase 2.</p>
      @if (auth.role() === 'admin') {
        <a routerLink="/team">Manage team (create staff / rider)</a>
      }
    </main>
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #ddd; }
    .who { display: flex; gap: 0.75rem; align-items: center; }
    main { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
    button { padding: 0.4rem 0.75rem; cursor: pointer; }
  `,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
