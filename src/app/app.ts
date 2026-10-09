import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { ApiService } from './core/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <aside class="side">
        <a class="brand" routerLink="/tableau-de-bord">
          <span class="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>
          </span>
          ReunionApp
        </a>

        <nav aria-label="Navigation principale">
          <a routerLink="/tableau-de-bord" routerLinkActive="on">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
            Tableau de bord
          </a>
          <a routerLink="/reunions" routerLinkActive="on">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
            Réunions
          </a>
          <a routerLink="/parametres" routerLinkActive="on">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>
            Paramètres
          </a>
        </nav>

        <div class="foot" role="status">
          <span class="etat">
            <span class="dot" [class.ok]="serveur() === true" [class.ko]="serveur() === false"></span>
            {{ serveur() === null ? 'Vérification du serveur…' : serveur() ? 'Serveur local connecté' : 'Serveur injoignable' }}
          </span>
          <span class="local">Traitement 100 % local</span>
        </div>
      </aside>

      <main class="main"><router-outlet /></main>
    </div>
  `,
  styles: [`
    .shell { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh; }
    .side {
      background: var(--ink); color: #aeb3d1; padding: 1.6rem 1.1rem;
      display: flex; flex-direction: column; gap: 2.2rem;
      position: sticky; top: 0; height: 100vh;
    }
    .brand {
      display: flex; align-items: center; gap: .75rem; padding: 0 .6rem;
      color: #fff; font-size: 1.3rem; font-weight: 750; letter-spacing: -.02em; text-decoration: none;
    }
    .logo { width: 36px; height: 36px; border-radius: 11px; background: var(--accent); display: grid; place-items: center; flex: none; }
    .logo svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; }
    nav { display: flex; flex-direction: column; gap: .2rem; }
    nav a {
      display: flex; align-items: center; gap: .75rem; padding: .72rem .9rem; border-radius: 10px;
      color: inherit; text-decoration: none; font-weight: 550; transition: background .15s, color .15s;
    }
    nav a:hover { background: var(--ink-2); color: #fff; }
    nav a.on { background: #242952; color: #fff; box-shadow: inset 3px 0 0 #8d9bff; }
    nav a.on svg { stroke: #aab4ff; }
    nav svg { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .foot { margin-top: auto; padding: .9rem .6rem 0; border-top: 1px solid #2c3052; font-size: .85rem; display: grid; gap: .3rem; }
    .etat { display: flex; align-items: center; gap: .5rem; color: #d3d6ea; }
    .local { color: #7d83a8; }
    .dot { width: .6rem; height: .6rem; border-radius: 50%; background: #7b7f99; }
    .dot.ok { background: #3ecf9f; box-shadow: 0 0 0 3px rgba(62,207,159,.18); }
    .dot.ko { background: #ff7676; box-shadow: 0 0 0 3px rgba(255,118,118,.18); }
    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1rem; }
      nav { flex-direction: row; flex-wrap: wrap; }
      .foot { margin: 0; border: 0; padding: 0; }
    }
  `],
})
export class App {
  private api = inject(ApiService);

  /** true = serveur joignable, false = injoignable, null = vérification en cours. */
  serveur = toSignal(
    this.api.tic(10_000).pipe(
      switchMap(() =>
        this.api.sante().pipe(
          map((): boolean | null => true),
          catchError(() => of(false as boolean | null))
        )
      )
    ),
    { initialValue: null }
  );
}