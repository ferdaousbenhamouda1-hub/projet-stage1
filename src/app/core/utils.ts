import { Reunion, Segment, Statut } from './models';

export const LIBELLE_STATUT: Record<Statut, string> = {
  en_attente: 'En attente',
  extraction_audio: 'Extraction audio',
  transcription: 'Transcription',
  structuration: 'Structuration',
  consolidation: 'Consolidation',
  termine: 'Terminé',
  echec: 'Échec',
};

export const estFinal = (s: Statut): boolean => s === 'termine' || s === 'echec';

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDuree(s?: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** 75 -> 01:15 ; 3725 -> 1:02:05 */
export function formatHeure(s: number): string {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

export function formatTaille(octets: number): string {
  const mo = octets / 1048576;
  if (mo >= 1024) return (mo / 1024).toFixed(1) + ' Go';
  if (mo >= 1) return mo.toFixed(1) + ' Mo';
  return Math.max(1, Math.round(octets / 1024)) + ' Ko';
}

/** Minuscules sans accents, pour une recherche tolérante. */
export function normaliser(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function nomFichier(titre: string): string {
  return normaliser(titre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'compte-rendu';
}

export function telecharger(contenu: Blob, nom: string): void {
  const url = URL.createObjectURL(contenu);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUT_ACTION: Record<string, string> = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait' };

/** Export Markdown généré dans le navigateur (EF14). */
export function versMarkdown(r: Reunion): string {
  const cr = r.compte_rendu;
  if (!cr) return `# ${r.titre}\n`;
  const segs = new Map(r.segments.map(s => [s.id, s] as [string, Segment]));
  const src = (id?: string | null) =>
    id && segs.has(id) ? ` _(passage ${formatHeure(segs.get(id)!.debut)})_` : '';
  const cell = (t?: string | null) => (t ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

  const l: string[] = [];
  l.push(`# ${r.titre}`, '', `Réunion du ${formatDate(r.date)}.`, '');
  l.push('## Résumé', '', cr.resume, '');
  if (cr.sujets.length) l.push('Sujets abordés : ' + cr.sujets.join(', '), '');
  l.push('## Décisions', '');
  l.push(...(cr.decisions.length ? cr.decisions.map(d => `- ${d.libelle}${src(d.segment_id)}`) : ['Aucune décision relevée.']), '');
  l.push('## Actions', '');
  if (cr.actions.length) {
    l.push('| Action | Responsable | Échéance | Statut |', '| --- | --- | --- | --- |');
    cr.actions.forEach(a =>
      l.push(`| ${cell(a.libelle)} | ${cell(a.responsable)} | ${cell(a.echeance)} | ${STATUT_ACTION[a.statut] ?? a.statut} |`));
  } else l.push('Aucune action relevée.');
  l.push('', '## Points en suspens', '');
  l.push(...(cr.points_en_suspens.length ? cr.points_en_suspens.map(p => `- ${p.libelle}${src(p.segment_id)}`) : ['Aucun point en suspens.']), '');
  l.push('---', '_Compte rendu généré automatiquement, relu et validé par un humain._', '');
  return l.join('\n');
}