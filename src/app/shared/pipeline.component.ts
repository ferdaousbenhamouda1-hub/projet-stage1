import { Component, Input } from '@angular/core';
import { Statut } from '../core/models';

type EtatEtape = 'fait' | 'actif' | 'attente' | 'echec';

const ETAPES: { cle: Statut; titre: string; detail: string }[] = [
  { cle: 'en_attente', titre: 'En file d\'attente', detail: 'Fichier reçu' },
  { cle: 'extraction_audio', titre: 'Extraction audio', detail: 'ffmpeg' },
  { cle: 'transcription', titre: 'Transcription', detail: 'faster-whisper' },
  { cle: 'structuration', titre: 'Structuration', detail: 'Ollama' },
  { cle: 'consolidation', titre: 'Consolidation', detail: 'Fusion des blocs' },
];

/** Suivi visuel du traitement asynchrone (EF11). La ligne se remplit avec la progression réelle. */
@Component({
  selector: 'app-pipeline',
  standalone: true,
  template: `
    <ol class="steps" aria-label="Étapes du traitement">
      @for (e of etapes; track e.cle; let i = $index) {
        <li [attr.data-etat]="etat(i)" [style.--p]="pct() + '%'">
          <span class="pt"></span>
          <span class="nm">{{ e.titre }}</span>
          <span class="dt">
            @if (etat(i) === 'actif' && progression != null) { {{ progression }} % } @else { {{ e.detail }} }
          </span>
        </li>
      }
    </ol>
  `,
  styles: [`
    .steps { list-style: none; margin: 0; padding: 0; display: flex; gap: .5rem; }
    li { flex: 1; position: relative; padding-top: 1.7rem; display: grid; gap: .1rem; align-content: start; min-width: 0; --p: 8%; }
    li::before { content: ''; position: absolute; top: .55rem; left: .55rem; right: -.5rem; height: 3px; border-radius: 3px; background: var(--line); }
    li:last-child::before { display: none; }
    li[data-etat='fait']::before { background: var(--ok); }
    li[data-etat='actif']::before { background: linear-gradient(90deg, var(--accent) var(--p), var(--line) var(--p)); }
    .pt { position: absolute; top: 0; left: 0; width: 1.1rem; height: 1.1rem; border-radius: 50%; background: var(--line); border: 3px solid #fff; box-sizing: content-box; margin: -3px; z-index: 1; }
    li[data-etat='fait'] .pt { background: var(--ok); }
    li[data-etat='actif'] .pt { background: var(--accent); animation: pulse 1.6s ease-out infinite; }
    li[data-etat='echec'] .pt { background: var(--ko); }
    .nm { font-weight: 650; font-size: .92rem; }
    .dt { color: var(--muted); font-size: .82rem; }
    li[data-etat='attente'] .nm { color: var(--muted); font-weight: 550; }
    li[data-etat='echec'] .nm { color: var(--ko); }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74,95,224,.45); } 100% { box-shadow: 0 0 0 10px rgba(74,95,224,0); } }
    @media (max-width: 700px) {
      .steps { flex-direction: column; gap: 1rem; }
      li { padding: 0 0 0 1.8rem; }
      li::before { display: none; }
    }
  `],
})
export class PipelineComponent {
  @Input({ required: true }) statut!: Statut;
  @Input() progression?: number | null;
  @Input() etapeEchec?: Statut | null;

  etapes = ETAPES;

  etat(i: number): EtatEtape {
    if (this.statut === 'termine') return 'fait';
    if (this.statut === 'echec') {
      const f = ETAPES.findIndex(e => e.cle === this.etapeEchec);
      return f < 0 ? 'attente' : i < f ? 'fait' : i === f ? 'echec' : 'attente';
    }
    const cur = ETAPES.findIndex(e => e.cle === this.statut);
    return i < cur ? 'fait' : i === cur ? 'actif' : 'attente';
  }

  pct(): number {
    return Math.max(8, Math.min(100, this.progression ?? 8));
  }
}