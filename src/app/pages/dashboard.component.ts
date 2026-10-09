import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { ReunionResume } from '../core/models';
import { estFinal } from '../core/utils';
import { MeetingsTableComponent } from '../shared/meetings-table.component';
import { UploadZoneComponent } from '../shared/upload-zone.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MeetingsTableComponent, UploadZoneComponent],
  template: `
    <div class="page">
      <header class="head"><h1>Tableau de bord</h1></header>

      <section class="card" aria-labelledby="depot">
        <h2 id="depot">Déposer un nouvel enregistrement</h2>
        <p class="muted intro">
          Le fichier est transcrit et analysé sur cette machine. Aucune donnée ne quitte l'entreprise.
        </p>
        <app-upload-zone />
      </section>

      <section class="stats" aria-label="Indicateurs">
        <div><span>Réunions du jour</span><b>{{ duJour() }}</b></div>
        <div><span>En cours de traitement</span><b>{{ enCours() }}</b></div>
        <div [class.alerte]="aRelire() > 0"><span>À relire</span><b>{{ aRelire() }}</b></div>
        <div><span>Validées</span><b>{{ validees() }}</b></div>
      </section>

      <section class="recentes">
        <div class="sec-head">
          <h2>Réunions récentes</h2>
          <a routerLink="/reunions">Voir toutes les réunions</a>
        </div>
        <app-meetings-table [reunions]="recentes()" vide="Aucune réunion pour le moment. Déposez un premier enregistrement ci-dessus." />
      </section>
    </div>
  `,
  styles: [`
    .intro { margin: .3rem 0 1.2rem; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
    .stats div { padding: 1.1rem 1.4rem; display: grid; gap: .2rem; border-left: 1px solid var(--line); }
    .stats div:first-child { border-left: 0; }
    .stats span { color: var(--muted); font-weight: 600; font-size: .88rem; }
    .stats b { font-size: 2rem; letter-spacing: -.02em; line-height: 1.1; }
    .stats .alerte b { color: var(--warn); }
    .sec-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: .8rem; }
    @media (max-width: 760px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .stats div:nth-child(3) { border-left: 0; }
      .stats div:nth-child(n+3) { border-top: 1px solid var(--line); }
    }
  `],
})
export class DashboardComponent {
  private api = inject(ApiService);

  /** Données réelles du serveur, rafraîchies toutes les 5 s. */
  reunions = toSignal(this.api.listeLive(), { initialValue: [] as ReunionResume[] });

  private aujourdhui = new Date().toLocaleDateString('sv-SE');
  duJour = computed(() => this.reunions().filter(r => r.date?.slice(0, 10) === this.aujourdhui).length);
  enCours = computed(() => this.reunions().filter(r => !estFinal(r.statut)).length);
  aRelire = computed(() => this.reunions().filter(r => r.statut === 'termine' && !r.valide).length);
  validees = computed(() => this.reunions().filter(r => r.statut === 'termine' && r.valide).length);
  recentes = computed(() => this.reunions().slice(0, 5));
}