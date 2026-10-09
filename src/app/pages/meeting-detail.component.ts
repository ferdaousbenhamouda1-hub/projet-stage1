import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, combineLatest, switchMap, tap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Action, CompteRendu, Decision, Reunion, Segment } from '../core/models';
import { formatDate, formatDuree, formatHeure, nomFichier, normaliser, telecharger, versMarkdown } from '../core/utils';
import { PipelineComponent } from '../shared/pipeline.component';
import { StatutChipComponent } from '../shared/statut-chip.component';

type ChampAction = 'libelle' | 'responsable' | 'echeance' | 'statut';

/**
 * Page d'une réunion :
 *  - en cours : suivi des étapes (EF11) ;
 *  - échec : relance sans redéposer le fichier (EF17) ;
 *  - terminé : compte rendu éditable (EF12) en regard de la transcription (EF13),
 *    chaque élément relié à son passage source, validation obligatoire avant export (EF14).
 */
@Component({
  selector: 'app-meeting-detail',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, FormsModule, PipelineComponent, StatutChipComponent],
  template: `
    <div class="page">
      <a class="retour" routerLink="/reunions">‹ Toutes les réunions</a>

      @if (introuvable()) {
        <section class="card">
          <h1>Réunion introuvable</h1>
          <p class="muted">Cette réunion n'existe pas ou a été supprimée.</p>
        </section>
      } @else if (!m()) {
        <p class="muted">Chargement…</p>
      }

      @if (m(); as r) {
        <header class="head">
          <div>
            <h1>{{ r.titre }}</h1>
            <p class="meta muted">
              <span>{{ dateFr(r.date) }}</span>
              @if (r.duree_secondes != null) { <span>Durée {{ dureeFr(r.duree_secondes) }}</span> }
              @if (r.compte_rendu?.modele) { <span>Modèle {{ r.compte_rendu!.modele }}</span> }
            </p>
          </div>
          <div class="droite">
            <app-statut [statut]="r.statut" [valide]="r.valide ?? false" />
            @if (r.statut === 'termine') {
              <button class="btn" type="button" [disabled]="!r.valide" (click)="exporterMd()"
                      [attr.title]="r.valide ? null : 'Validez le compte rendu pour l’exporter'">Exporter en Markdown</button>
              <button class="btn" type="button" [disabled]="!r.valide" (click)="exporterWord()"
                      [attr.title]="r.valide ? null : 'Validez le compte rendu pour l’exporter'">Exporter en Word</button>
            }
          </div>
        </header>

        @if (notice(); as n) { <p class="notice" [class.ko]="n.ko" role="status">{{ n.texte }}</p> }

        @if (r.statut !== 'termine') {
          <section class="card suivi">
            <app-pipeline [statut]="r.statut" [progression]="r.progression" [etapeEchec]="r.etape_echec" />
            @if (r.statut === 'echec') {
              <div class="echec" role="alert">
                <p><strong>Le traitement s'est arrêté.</strong> {{ r.erreur || 'Aucun détail fourni par le serveur.' }}</p>
                <p class="muted">Le fichier déposé et la transcription déjà produite sont conservés. Vous n'avez pas besoin de redéposer l'enregistrement.</p>
                <button class="btn btn-primary" type="button" (click)="relancer()">Relancer le traitement</button>
              </div>
            } @else {
              <p class="muted note">
                Le traitement peut durer plusieurs minutes selon la longueur de l'enregistrement.
                Vous pouvez quitter cette page : il continue sur le serveur et la réunion apparaîtra « À relire » dans la liste.
              </p>
            }
          </section>
        } @else {
          @if (r.compte_rendu; as cr) {
            @if (!r.valide) {
              <div class="banner warn" role="status">
                <p><strong>Proposition à relire.</strong> Ce compte rendu a été généré automatiquement et peut contenir des erreurs.
                  Contrôlez chaque décision et chaque action avec son passage source, corrigez si besoin, puis validez pour activer l'export.</p>
                <button class="btn btn-primary" type="button" (click)="valider()">J'ai relu, valider</button>
              </div>
            } @else {
              <div class="banner ok" role="status"><p><strong>Compte rendu validé.</strong> Vous pouvez l'exporter.</p></div>
            }

            <div class="cols">
              <div class="cr">
                <section class="card">
                  <h2>Résumé</h2>
                  <p class="resume">{{ cr.resume }}</p>
                  @if (cr.sujets.length) {
                    <ul class="sujets" aria-label="Sujets abordés">
                      @for (s of cr.sujets; track s) { <li>{{ s }}</li> }
                    </ul>
                  }
                </section>

                <section class="card">
                  <h2>Décisions <span class="n">{{ cr.decisions.length }}</span></h2>
                  @for (d of cr.decisions; track d.id) {
                    <div class="item">
                      <textarea class="edit" rows="2" [value]="d.libelle" (change)="editDecision(d, $event)" [attr.aria-label]="'Décision : ' + d.libelle"></textarea>
                      <ng-container *ngTemplateOutlet="source; context: { id: d.segment_id }"></ng-container>
                    </div>
                  } @empty { <p class="muted vide">Aucune décision relevée dans cette réunion.</p> }
                </section>

                <section class="card">
                  <h2>Actions <span class="n">{{ cr.actions.length }}</span></h2>
                  @for (a of cr.actions; track a.id) {
                    <div class="item action" [class.fait]="a.statut === 'fait'">
                      <textarea class="edit" rows="2" [value]="a.libelle" (change)="editAction(a, 'libelle', $event)" [attr.aria-label]="'Action : ' + a.libelle"></textarea>
                      <div class="champs">
                        <input class="in" placeholder="Responsable à préciser" [value]="a.responsable ?? ''" (change)="editAction(a, 'responsable', $event)" aria-label="Responsable" />
                        <input class="in" type="date" [value]="a.echeance ?? ''" (change)="editAction(a, 'echeance', $event)" aria-label="Échéance" />
                        <select class="in" (change)="editAction(a, 'statut', $event)" aria-label="Statut de l'action">
                          @for (o of STATUTS; track o.v) { <option [value]="o.v" [selected]="a.statut === o.v">{{ o.t }}</option> }
                        </select>
                        <ng-container *ngTemplateOutlet="source; context: { id: a.segment_id }"></ng-container>
                      </div>
                    </div>
                  } @empty { <p class="muted vide">Aucune action relevée dans cette réunion.</p> }
                </section>

                @if (cr.points_en_suspens.length) {
                  <section class="card">
                    <h2>Points en suspens <span class="n">{{ cr.points_en_suspens.length }}</span></h2>
                    @for (p of cr.points_en_suspens; track p.id) {
                      <div class="item"><p class="pt">{{ p.libelle }}</p>
                        <ng-container *ngTemplateOutlet="source; context: { id: p.segment_id }"></ng-container>
                      </div>
                    }
                  </section>
                }
              </div>
            </div>

            <!-- Lien vers le passage source : traçabilité, et signale les éléments sans source -->
            <ng-template #source let-id="id">
              @if (id) {
                <button class="src" type="button" (click)="voirSource(id)">Passage {{ heure(id) }}</button>
              } @else {
                <span class="nosrc" title="Aucun passage de la transcription n'est associé : à vérifier en priorité.">Sans source</span>
              }
            </ng-template>
          } @else {
            <section class="card"><p class="muted">Le traitement est terminé mais aucun compte rendu n'a été produit.</p></section>
          }
        }
      }
    </div>
  `,
  styles: [`
    .retour { text-decoration: none; font-weight: 600; width: fit-content; }
    .meta { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-top: .4rem; }
    .droite { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    .notice { background: var(--ok-soft); color: var(--ok); padding: .6rem .9rem; border-radius: 9px; font-weight: 600; }
    .notice.ko { background: var(--ko-soft); color: var(--ko); }

    .suivi { display: grid; gap: 1.4rem; padding: 2rem 1.8rem; }
    .echec { background: var(--ko-soft); border-radius: 10px; padding: 1rem 1.2rem; display: grid; gap: .6rem; justify-items: start; }
    .echec strong { color: var(--ko); }
    .note { max-width: 70ch; }

    .banner { display: flex; justify-content: space-between; align-items: center; gap: 1.2rem; padding: 1rem 1.3rem; border-radius: 12px; flex-wrap: wrap; }
    .banner p { max-width: 80ch; }
    .banner.warn { background: var(--warn-soft); color: #5e3900; border: 1px solid #f0d9a4; }
    .banner.ok { background: var(--ok-soft); color: #0e5b49; border: 1px solid #b6e2d6; }

    .cols {
      display: grid;
      grid-template-columns: 1fr;
    }
    .cr { display: grid; gap: 1.2rem; }
    .cr h2 { margin-bottom: .8rem; }
    .n { margin-left: .4rem; font-size: .8rem; font-weight: 650; color: var(--muted); background: var(--paper); padding: .1rem .5rem; border-radius: 999px; }
    .resume { line-height: 1.65; max-width: 75ch; white-space: pre-line; }
    .sujets { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none; padding: 0; margin: 1rem 0 0; }
    .sujets li { background: var(--accent-soft); color: var(--accent-ink); border-radius: 999px; padding: .2rem .7rem; font-size: .85rem; font-weight: 600; }

    .item { display: grid; gap: .5rem; justify-items: start; padding: .9rem 0; border-top: 1px solid var(--line); }
    h2 + .item { border-top: 0; padding-top: 0; }
    .edit {
      width: 100%; border: 1px solid transparent; border-radius: 8px; padding: .4rem .55rem; margin: -.4rem -.55rem;
      background: transparent; resize: vertical; line-height: 1.5; field-sizing: content;
    }
    .edit:hover { border-color: var(--line); }
    .edit:focus { border-color: var(--accent); background: #fff; outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
    .action.fait .edit { color: var(--muted); text-decoration: line-through; }
    .champs { display: grid; grid-template-columns: minmax(0, 1.4fr) 150px 120px auto; gap: .5rem; width: 100%; align-items: center; }
    .pt { line-height: 1.5; }
    .vide { padding: .5rem 0; }

    .src { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: .15rem .7rem; font-size: .82rem; font-weight: 650; color: var(--accent-ink); cursor: pointer; white-space: nowrap; }
    .src:hover { background: var(--accent-soft); border-color: var(--accent); }
    .nosrc { background: var(--warn-soft); color: var(--warn); border-radius: 999px; padding: .15rem .7rem; font-size: .82rem; font-weight: 650; white-space: nowrap; }

    @media (max-width: 1000px) {
      .cols { grid-template-columns: 1fr; }
      .champs { grid-template-columns: 1fr 1fr; }
    }
  `],
})
export class MeetingDetailComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private reload = new BehaviorSubject<void>(undefined);

  m = signal<Reunion | null>(null);
  introuvable = signal(false);
  notice = signal<{ texte: string; ko: boolean } | null>(null);
  recherche = signal('');
  segmentActif = signal<string | null>(null);

  readonly STATUTS = [
    { v: 'a_faire', t: 'À faire' },
    { v: 'en_cours', t: 'En cours' },
    { v: 'fait', t: 'Fait' },
  ];
  dateFr = formatDate;
  dureeFr = formatDuree;
  hms = formatHeure;

  segments = computed(() => this.m()?.segments ?? []);
  private index = computed(() => new Map(this.segments().map(s => [s.id, s] as [string, Segment])));
  visibles = computed(() => {
    const q = normaliser(this.recherche().trim());
    return q ? this.segments().filter(s => normaliser(s.texte).includes(q)) : this.segments();
  });

  constructor() {
    combineLatest([this.route.paramMap, this.reload])
      .pipe(
        tap(([p]) => { if (this.m()?.id !== p.get('id')) this.m.set(null); }),
        switchMap(([p]) => this.api.suivre(p.get('id')!)),
        takeUntilDestroyed()
      )
      .subscribe({ next: r => this.m.set(r), error: () => this.introuvable.set(true) });
  }

  heure(segmentId: string): string {
    const s = this.index().get(segmentId);
    return s ? formatHeure(s.debut) : '—';
  }

  voirSource(id: string): void {
    this.recherche.set('');
    this.segmentActif.set(id);
    setTimeout(() => document.getElementById('seg-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  private val(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  private cr(fn: (c: CompteRendu) => CompteRendu): void {
    this.m.update(m => (m && m.compte_rendu ? { ...m, compte_rendu: fn(m.compte_rendu) } : m));
  }

  editDecision(d: Decision, e: Event): void {
    const libelle = this.val(e).trim();
    if (!libelle || libelle === d.libelle) return;
    this.cr(c => ({ ...c, decisions: c.decisions.map(x => (x.id === d.id ? { ...x, libelle } : x)) }));
    this.sauver(this.api.majDecision(this.m()!.id, d.id, { libelle }));
  }

  editAction(a: Action, champ: ChampAction, e: Event): void {
    let v: string | null = this.val(e).trim();
    if (champ === 'libelle' && !v) return;
    if (champ === 'responsable' || champ === 'echeance') v = v || null;
    if (v === (a[champ] ?? null)) return;
    const patch = { [champ]: v } as Partial<Action>;
    this.cr(c => ({ ...c, actions: c.actions.map(x => (x.id === a.id ? { ...x, ...patch } : x)) }));
    this.sauver(this.api.majAction(this.m()!.id, a.id, patch));
  }

  private sauver(req: Observable<unknown>): void {
    req.subscribe({
      next: () => this.notify('Modification enregistrée.'),
      error: () => this.notify('La modification n\'a pas été enregistrée. Vérifiez que le serveur local est démarré.', true),
    });
  }

  valider(): void {
    const r = this.m();
    if (!r) return;
    this.api.valider(r.id).subscribe({
      next: () => { this.m.update(x => (x ? { ...x, valide: true } : x)); this.notify('Compte rendu validé. L\'export est disponible.'); },
      error: () => this.notify('La validation a échoué. Réessayez.', true),
    });
  }

  relancer(): void {
    const r = this.m();
    if (!r) return;
    this.api.relancer(r.id).subscribe({
      next: () => {
        this.m.update(x => (x ? { ...x, statut: 'en_attente', erreur: null, etape_echec: null } : x));
        this.reload.next();
      },
      error: () => this.notify('Impossible de relancer le traitement pour le moment.', true),
    });
  }

  exporterMd(): void {
    const r = this.m();
    if (!r?.valide) return;
    telecharger(new Blob([versMarkdown(r)], { type: 'text/markdown;charset=utf-8' }), nomFichier(r.titre) + '.md');
  }

  exporterWord(): void {
    const r = this.m();
    if (!r?.valide) return;
    this.api.exporterDocx(r.id).subscribe({
      next: b => telecharger(b, nomFichier(r.titre) + '.docx'),
      error: () => this.notify('L\'export Word n\'est pas disponible sur le serveur. Utilisez l\'export Markdown.', true),
    });
  }

  private notify(texte: string, ko = false): void {
    this.notice.set({ texte, ko });
    setTimeout(() => this.notice.set(null), 4000);
  }
}