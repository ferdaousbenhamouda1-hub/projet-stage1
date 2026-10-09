import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ReunionResume } from '../core/models';
import { estFinal } from '../core/utils';
import { MeetingsTableComponent } from '../shared/meetings-table.component';

type Filtre = 'tous' | 'cours' | 'relire' | 'valide' | 'echec';

/** Historique des réunions avec recherche (EF16) et filtres par état. */
@Component({
  selector: 'app-meetings',
  standalone: true,
  imports: [FormsModule, MeetingsTableComponent],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Réunions</h1>
          <p class="muted">{{ visibles().length }} {{ visibles().length > 1 ? 'réunions' : 'réunion' }}</p>
        </div>
      </header>

      <div class="outils">
        <input class="in" type="search" placeholder="Rechercher un mot, une action, un titre…"
               aria-label="Rechercher dans l'historique" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <div class="filtres" role="group" aria-label="Filtrer par état">
          @for (f of FILTRES; track f.v) {
            <button type="button" [class.on]="filtre() === f.v" [attr.aria-pressed]="filtre() === f.v" (click)="filtre.set(f.v)">{{ f.t }}</button>
          }
        </div>
      </div>

      <app-meetings-table [reunions]="visibles()"
        [vide]="q() ? 'Aucun résultat pour cette recherche.' : 'Aucune réunion dans cette catégorie.'" />
    </div>
  `,
  styles: [`
    .outils { display: grid; gap: .8rem; }
    .filtres { display: flex; gap: .4rem; flex-wrap: wrap; }
    .filtres button {
      border: 1px solid var(--line); background: var(--surface); border-radius: 999px;
      padding: .35rem .9rem; font-weight: 600; font-size: .88rem; cursor: pointer; color: var(--muted);
    }
    .filtres button:hover { border-color: #c3c6b9; }
    .filtres button.on { background: var(--ink); border-color: var(--ink); color: #fff; }
  `],
})
export class MeetingsComponent {
  private api = inject(ApiService);

  readonly FILTRES: { v: Filtre; t: string }[] = [
    { v: 'tous', t: 'Toutes' },
    { v: 'cours', t: 'En cours' },
    { v: 'relire', t: 'À relire' },
    { v: 'valide', t: 'Validées' },
    { v: 'echec', t: 'En échec' },
  ];

  q = signal('');
  filtre = signal<Filtre>('tous');

  /** La saisie est attendue 250 ms avant d'interroger le serveur, puis la liste reste rafraîchie. */
  private brut = toSignal(
    toObservable(this.q).pipe(debounceTime(250), switchMap(q => this.api.listeLive(q.trim()))),
    { initialValue: [] as ReunionResume[] }
  );

  visibles = computed(() =>
    this.brut().filter(r => {
      switch (this.filtre()) {
        case 'cours': return !estFinal(r.statut);
        case 'relire': return r.statut === 'termine' && !r.valide;
        case 'valide': return r.statut === 'termine' && !!r.valide;
        case 'echec': return r.statut === 'echec';
        default: return true;
      }
    })
  );
}