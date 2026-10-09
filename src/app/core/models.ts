export type Statut =
  | 'en_attente'
  | 'extraction_audio'
  | 'transcription'
  | 'structuration'
  | 'consolidation'
  | 'termine'
  | 'echec';

export interface ReunionResume {
  id: string;
  titre: string;
  date: string;
  statut: Statut;
  progression?: number | null;
  duree_secondes?: number | null;
  valide?: boolean;
  nb_decisions?: number | null;
  nb_actions?: number | null;
}

export interface Segment {
  id: string;
  debut: number;
  fin: number;
  texte: string;
  locuteur?: string | null;
}

export interface Decision { id: string; libelle: string; segment_id?: string | null; }
export interface PointSuspens { id: string; libelle: string; segment_id?: string | null; }

export type StatutAction = 'a_faire' | 'en_cours' | 'fait';
export interface Action {
  id: string;
  libelle: string;
  responsable?: string | null;
  echeance?: string | null;
  statut: StatutAction;
  segment_id?: string | null;
}

export interface CompteRendu {
  resume: string;
  sujets: string[];
  decisions: Decision[];
  actions: Action[];
  points_en_suspens: PointSuspens[];
  modele?: string | null;
  genere_le?: string | null;
}

export interface Reunion extends ReunionResume {
  erreur?: string | null;
  etape_echec?: Statut | null;
  compte_rendu?: CompteRendu | null;
  segments: Segment[];
}

export interface TermeMetier { terme: string; remplacement: string; }

export type DepotEvent =
  | { type: 'progress'; pct: number }
  | { type: 'done'; id: string };
