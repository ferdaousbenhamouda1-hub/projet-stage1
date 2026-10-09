
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { TermeMetier } from '../core/models';

/** Paramètres : dictionnaire de termes métier (EF04). */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <header class="head"><h1>Paramètres</h1></header>

      <section class="card" aria-labelledby="dico">
        <h2 id="dico">Dictionnaire de termes métier</h2>
        <p class="muted intro">
          Corrige les noms propres et les acronymes internes que la transcription écrit mal.
          Chaque entrée associe ce que le modèle écrit à l'écriture correcte.
        </p>

        @if (etat() === 'chargement') {
          <p class="muted">Chargement du dictionnaire…</p>
        } @else if (etat() === 'erreur') {
          <p class="erreur" role="alert">Le dictionnaire est inaccessible. Vérifiez que le serveur local est démarré.</p>
        } @else {
          <div class="grille entete"><span>Terme transcrit</span><span>Écriture correcte</span><span></span></div>
          @for (t of termes(); track $index; let i = $index) {
            <div class="grille">
              <input class="in" [ngModel]="t.terme" (ngModelChange)="modifier(i, 'terme', $event)" [attr.aria-label]="'Terme transcrit ' + (i + 1)" />
              <input class="in" [ngModel]="t.remplacement" (ngModelChange)="modifier(i, 'remplacement', $event)" [attr.aria-label]="'Écriture correcte ' + (i + 1)" />
              <button class="btn" type="button" (click)="retirer(i)" [attr.aria-label]="'Retirer l’entrée ' + (i + 1)">Retirer</button>
            </div>
          } @empty {
            <p class="muted vide">Aucun terme pour le moment.</p>
          }

          <div class="grille ajout">
            <input class="in" placeholder="Ex. cube er nets" [ngModel]="nTerme()" (ngModelChange)="nTerme.set($event)" (keyup.enter)="ajouter()" aria-label="Nouveau terme transcrit" />
            <input class="in" placeholder="Ex. Kubernetes" [ngModel]="nRemp()" (ngModelChange)="nRemp.set($event)" (keyup.enter)="ajouter()" aria-label="Nouvelle écriture correcte" />
            <button class="btn" type="button" (click)="ajouter()" [disabled]="!nTerme().trim() || !nRemp().trim()">Ajouter</button>
          </div>

          <div class="bas">
            <button class="btn btn-primary" type="button" (click)="enregistrer()" [disabled]="!modifie()">Enregistrer le dictionnaire</button>
            @if (message(); as m) { <span [class]="m.ko ? 'ko' : 'ok'" role="status">{{ m.texte }}</span> }
          </div>
        }
      </section>

      <section class="card">
        <h2>Confidentialité</h2>
        <p class="muted intro">
          Cette interface n'utilise aucune police, aucun script et aucun service externe. Pour le démontrer,
          ouvrez l'onglet Réseau des outils de développement du navigateur : seules des requêtes vers le serveur local y apparaissent.
        </p>
      </section>
    </div>
  `,
  styles: [`
    .intro { margin: .3rem 0 1.2rem; max-width: 70ch; }
    .grille { display: grid; grid-template-columns: 1fr 1fr 100px; gap: .6rem; margin-bottom: .6rem; align-items: center; }
    .entete { font-size: .85rem; font-weight: 600; color: var(--muted); margin-bottom: .3rem; }
    .ajout { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--line); }
    .bas { margin-top: 1rem; display: flex; align-items: center; gap: 1rem; }
    .ok { color: var(--ok); font-weight: 600; }
    .ko, .erreur { color: var(--ko); font-weight: 600; }
    @media (max-width: 640px) { .grille { grid-template-columns: 1fr; } }
  `],
})
export class SettingsComponent {
  private api = inject(ApiService);

  termes = signal<TermeMetier[]>([]);
  etat = signal<'chargement' | 'pret' | 'erreur'>('chargement');
  modifie = signal(false);
  message = signal<{ texte: string; ko: boolean } | null>(null);
  nTerme = signal('');
  nRemp = signal('');

  constructor() {
    this.api.glossaire().subscribe({
      next: t => { this.termes.set(t); this.etat.set('pret'); },
      error: () => this.etat.set('erreur'),
    });
  }

  modifier(i: number, champ: keyof TermeMetier, valeur: string): void {
    this.termes.update(l => l.map((t, k) => (k === i ? { ...t, [champ]: valeur } : t)));
    this.modifie.set(true);
    this.message.set(null);
  }

  retirer(i: number): void {
    this.termes.update(l => l.filter((_, k) => k !== i));
    this.modifie.set(true);
    this.message.set(null);
  }

  ajouter(): void {
    const terme = this.nTerme().trim();
    const remplacement = this.nRemp().trim();
    if (!terme || !remplacement) return;
    this.termes.update(l => [...l, { terme, remplacement }]);
    this.nTerme.set('');
    this.nRemp.set('');
    this.modifie.set(true);
    this.message.set(null);
  }

  enregistrer(): void {
    const propres = this.termes().filter(t => t.terme.trim() && t.remplacement.trim());
    this.api.enregistrerGlossaire(propres).subscribe({
      next: () => { this.termes.set(propres); this.modifie.set(false); this.message.set({ texte: 'Dictionnaire enregistré. Il sera appliqué aux prochaines transcriptions.', ko: false }); },
      error: () => this.message.set({ texte: 'Échec de l\'enregistrement. Vos modifications sont conservées à l\'écran, réessayez.', ko: true }),
    });
  }
}