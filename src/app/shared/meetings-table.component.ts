import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReunionResume } from '../core/models';
import { formatDate, formatDuree } from '../core/utils';
import { StatutChipComponent } from './statut-chip.component';
@Component({
  selector: 'app-meetings-table',
  standalone: true,
  imports: [RouterLink, StatutChipComponent],
  template: `
    @if (reunions.length === 0) {
      <p class="vide">{{ vide }}</p>
    } @else {
      <div class="list" role="list">
        @for (r of reunions; track r.id) {
          <a class="row" role="listitem" [routerLink]="['/reunions', r.id]">
            <span class="titre">
              <strong>{{ r.titre }}</strong>
              <small class="muted">{{ dateFr(r.date) }}</small>
            </span>
            <span class="muted duree">{{ r.duree_secondes != null ? dureeFr(r.duree_secondes) : '' }}</span>
            <span class="muted contenu">
              @if (r.statut === 'termine') {
                {{ r.nb_decisions ?? 0 }} décisions, {{ r.nb_actions ?? 0 }} actions
              }
            </span>
            <span class="etat">
              <app-statut [statut]="r.statut" [valide]="r.valide ?? false" />
              @if (r.progression != null && r.statut !== 'termine' && r.statut !== 'echec') {
                <span class="bar" aria-hidden="true"><i [style.width.%]="r.progression"></i></span>
              }
            </span>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .list { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
    .row {
      display: grid; grid-template-columns: minmax(0, 2fr) 90px minmax(0, 1.3fr) 170px;
      gap: 1rem; align-items: center; padding: 1rem 1.3rem; color: inherit; text-decoration: none;
      border-top: 1px solid var(--line); transition: background .12s;
    }
    .row:first-child { border-top: 0; }
    .row:hover { background: #f8f9f5; }
    .titre { display: grid; gap: .1rem; min-width: 0; }
    .titre strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .etat { display: grid; gap: .4rem; justify-items: start; }
    .bar { width: 100%; height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--accent); transition: width .4s; }
    .vide { padding: 2rem; text-align: center; color: var(--muted); background: var(--surface); border: 1px dashed var(--line); border-radius: 14px; }
    @media (max-width: 760px) {
      .row { grid-template-columns: 1fr auto; }
      .duree, .contenu { display: none; }
    }
  `],
})
export class MeetingsTableComponent {
  @Input({ required: true }) reunions: ReunionResume[] = [];
  @Input() vide = 'Aucune réunion.';
  dateFr = formatDate;
  dureeFr = formatDuree;
}