import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../core/api.service';
import { formatTaille } from '../core/utils';

const EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mkv', 'mov', 'webm', 'avi'];
const TAILLE_MAX = 2 * 1024 * 1024 * 1024; // 2 Go

/** Dépôt d'un enregistrement : formulaire à gauche, zone de dépôt « onde sonore » à droite. */
@Component({
  selector: 'app-upload-zone',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form">
      <label class="f">
        <span>Titre de la réunion</span>
        <input class="in" type="text" maxlength="120" placeholder="Ex. Comité de pilotage, point hebdo équipe"
               [ngModel]="titre()" (ngModelChange)="titre.set($event)" [disabled]="envoi()" />
      </label>
      <label class="f">
        <span>Date de la réunion</span>
        <input class="in" type="date" [ngModel]="date()" (ngModelChange)="date.set($event)" [disabled]="envoi()" />
      </label>

      <label class="consent">
        <input type="checkbox" [ngModel]="consentement()" (ngModelChange)="consentement.set($event)" [disabled]="envoi()" />
        <span>Les participants ont été informés que la réunion était enregistrée.</span>
      </label>

      @if (erreur(); as e) { <p class="erreur" role="alert">{{ e }}</p> }

      <div class="bas">
        <button class="btn btn-primary lancer" type="button" [disabled]="!peutLancer()" (click)="lancer()">
          {{ envoi() ? "Envoi en cours…" : "Lancer l'analyse locale" }}
        </button>
        @if (progression() !== null) {
          <div class="prog" role="progressbar" [attr.aria-valuenow]="progression()" aria-valuemin="0" aria-valuemax="100">
            <div class="barre"><i [style.width.%]="progression()"></i></div>
            <small class="muted">
              {{ progression()! < 100 ? 'Envoi vers le serveur local : ' + progression() + ' %' : 'Fichier reçu, démarrage du traitement…' }}
            </small>
          </div>
        } @else if (manque()) {
          <small class="muted">Il manque : {{ manque() }}.</small>
        }
      </div>
    </div>

    <label class="drop" [class.over]="survol()" [class.has]="!!fichier()" [class.busy]="envoi()"
           (dragover)="$event.preventDefault(); survol.set(true)"
           (dragleave)="survol.set(false)"
           (drop)="deposer($event)">
      <input class="sr" type="file" accept="audio/*,video/*" (change)="choisir($event)" [disabled]="envoi()" />

      <span class="onde" aria-hidden="true">
        @for (h of barres; track $index) { <i [style.height.%]="h" [style.--i]="$index"></i> }
      </span>

      @if (fichier(); as f) {
        <strong class="nom">{{ f.name }}</strong>
        <small>{{ taille(f.size) }}. Cliquez pour changer de fichier.</small>
      } @else {
        <strong>Glissez votre enregistrement ici</strong>
        <small>ou cliquez pour parcourir</small>
        <small class="formats">MP3, WAV, M4A, MP4, MKV, WebM. 2 Go maximum.</small>
      }
    </label>
  `,
  styles: [`
    :host { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 1.8rem; align-items: stretch; }

    .form { display: grid; gap: 1rem; align-content: start; }
    .f { display: grid; gap: .35rem; font-size: .85rem; font-weight: 600; color: var(--muted); }
    .consent {
      display: flex; gap: .7rem; align-items: flex-start; font-size: .92rem; cursor: pointer;
      padding: .8rem 1rem; border: 1px solid var(--line); border-radius: 10px; background: #fafaf7;
    }
    .consent input { width: 1.1rem; height: 1.1rem; margin-top: .15rem; accent-color: var(--accent); flex: none; }
    .erreur { background: var(--ko-soft); color: var(--ko); padding: .7rem .9rem; border-radius: 9px; font-weight: 550; }
    .bas { display: grid; gap: .6rem; }
    .lancer { padding: .8rem 1.2rem; font-size: 1rem; }
    small { font-size: .85rem; color: var(--muted); font-weight: 400; }
    .prog { display: grid; gap: .3rem; }
    .barre { height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
    .barre i { display: block; height: 100%; background: var(--accent); transition: width .2s; }

    .drop {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3rem;
      min-height: 290px; padding: 1.5rem; text-align: center; cursor: pointer;
      border: 2px dashed #cfd2c6; border-radius: 14px; background: #fafaf7;
      transition: border-color .15s, background .15s;
    }
    .drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-soft); }
    .drop:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
    .drop.has { border-style: solid; border-color: var(--ok); background: #f3fbf8; }
    .drop strong { font-size: 1.05rem; }
    .nom { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .formats { margin-top: .5rem; }

    .onde { display: flex; align-items: center; gap: 4px; height: 84px; margin-bottom: .8rem; }
    .onde i { width: 5px; border-radius: 3px; background: #c9cef3; transition: background .2s; }
    .drop:hover .onde i, .drop.over .onde i, .drop.busy .onde i {
      background: var(--accent);
      animation: danse 1s ease-in-out infinite alternate;
      animation-delay: calc(var(--i) * 45ms);
    }
    .drop.has:not(.busy) .onde i { background: var(--ok); }
    @keyframes danse { from { transform: scaleY(.4); } to { transform: scaleY(1); } }

    @media (max-width: 900px) {
      :host { grid-template-columns: 1fr; }
      .drop { min-height: 210px; }
    }
  `],
})
export class UploadZoneComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  /** Hauteurs (en %) des barres de l'onde décorative. */
  readonly barres = [30, 55, 40, 70, 50, 85, 60, 95, 45, 75, 35, 65, 90, 50, 80, 40, 70, 55, 95, 60, 45, 85, 35, 65, 50, 75, 40, 55];

  fichier = signal<File | null>(null);
  titre = signal('');
  date = signal(new Date().toLocaleDateString('sv-SE')); // AAAA-MM-JJ, heure locale
  consentement = signal(false);
  survol = signal(false);
  progression = signal<number | null>(null);
  erreur = signal<string | null>(null);

  taille = formatTaille;
  envoi = computed(() => this.progression() !== null);
  peutLancer = computed(
    () => !!this.fichier() && this.titre().trim().length > 0 && !!this.date() && this.consentement() && !this.envoi()
  );

  /** Liste ce qui empêche encore de lancer l'analyse. */
  manque = computed(() => {
    const m: string[] = [];
    if (!this.fichier()) m.push('un fichier');
    if (!this.titre().trim()) m.push('un titre');
    if (!this.consentement()) m.push('la confirmation');
    return m.join(', ');
  });

  choisir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.accepter(input.files?.[0]);
    input.value = ''; // permet de re-sélectionner le même fichier
  }

  deposer(ev: DragEvent): void {
    ev.preventDefault();
    this.survol.set(false);
    this.accepter(ev.dataTransfer?.files?.[0]);
  }

  private accepter(f?: File): void {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSIONS.includes(ext)) {
      this.erreur.set(`Le format « .${ext} » n'est pas pris en charge. Utilisez un fichier audio ou vidéo (${EXTENSIONS.join(', ')}).`);
      return;
    }
    if (f.size > TAILLE_MAX) {
      this.erreur.set(`Ce fichier fait ${formatTaille(f.size)}. La limite est de 2 Go : découpez l'enregistrement ou compressez-le.`);
      return;
    }
    this.erreur.set(null);
    this.fichier.set(f);
    if (!this.titre().trim()) {
      this.titre.set(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    }
  }

  lancer(): void {
    const f = this.fichier();
    if (!f || !this.peutLancer()) return;
    this.erreur.set(null);
    this.progression.set(0);
    this.api.deposer(f, this.titre().trim(), this.date()).subscribe({
      next: e => (e.type === 'progress' ? this.progression.set(e.pct) : this.router.navigate(['/reunions', e.id])),
      error: (err: HttpErrorResponse) => {
        this.progression.set(null);
        this.erreur.set(this.message(err));
      },
    });
  }

  private message(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Le serveur local ne répond pas. Vérifiez que l\'API FastAPI est démarrée, puis réessayez.';
    if (err.status === 413) return 'Le serveur refuse ce fichier car il est trop volumineux.';
    if (err.status === 415 || err.status === 422) return 'Le serveur a refusé le fichier ou les informations saisies. Vérifiez le format et le titre.';
    const d = err.error?.detail;
    return typeof d === 'string' ? d : `Le dépôt a échoué (erreur ${err.status}). Réessayez ou consultez les journaux du serveur.`;
  }
}