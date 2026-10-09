import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { BehaviorSubject, EMPTY, Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, take, takeWhile } from 'rxjs/operators';
import { Action, CompteRendu, Decision, DepotEvent, Reunion, ReunionResume, Segment, Statut, TermeMetier } from './models';
import { estFinal, normaliser } from './utils';

/* ====== À ADAPTER SI BESOIN (voir "Si une erreur 422 apparaît" plus bas) ====== */
const API = '/api';
const CHAMP_FICHIER = 'file';          // nom du champ fichier attendu par POST /api/transcrire
const CHAMP_TEXTE = 'full_text';   // nom du champ texte attendu par POST /api/generer-resume
/* ============================================================================== */

const CLE_REUNIONS = 'reunionapp.reunions';
const CLE_GLOSSAIRE = 'reunionapp.glossaire';

interface Local extends Reunion { texte?: string; }

const lib = (x: any): string =>
  typeof x === 'string'
    ? x
    : String(x?.libelle ?? x?.decision ?? x?.action ?? x?.tache ?? x?.description ?? x?.texte ?? x?.text ?? JSON.stringify(x));

/** Accepte une chaîne, une liste de segments ou un objet { transcription | texte | text | segments }. */
function lireTranscription(b: any): { texte: string; segments: Segment[] } {
    const chaine = typeof b === 'string' ? b : [b?.full_text, b?.transcription, b?.texte, b?.text].find(x => typeof x === 'string');
  const liste = [b?.segments, b?.transcription, b].find(x => Array.isArray(x));
  let segments: Segment[] = [];
  if (liste) {
    segments = liste.map((s: any, i: number) => ({
      id: String(i),
      debut: Number(s?.debut ?? s?.start ?? 0),
      fin: Number(s?.fin ?? s?.end ?? 0),
      texte: String(typeof s === 'string' ? s : (s?.texte ?? s?.text ?? '')).trim(),
      locuteur: s?.locuteur ?? s?.speaker ?? null,
    }));
  } else if (chaine) {
    segments = chaine
      .split(/\n+|(?<=[.!?])\s+/)
      .map((t: string) => t.trim())
      .filter(Boolean)
      .map((t: string, i: number) => ({ id: String(i), debut: 0, fin: 0, texte: t, locuteur: null }));
  }
  segments = segments.filter(s => s.texte);
  return { texte: chaine ?? segments.map(s => s.texte).join(' '), segments };
}

/** Accepte { resume, decisions, actions, ... } à plat, ou imbriqué dans compte_rendu / resultat. */
/** Accepte le format "formulaire" (description, type, place...) ou le format "compte rendu" (resume). */
function lireCompteRendu(b: any): CompteRendu {
  const c = b?.compte_rendu ?? b?.resultat ?? b;
  const tab = (x: any): any[] => (Array.isArray(x) ? x : []);
  const texte = (x: any): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

  // Type, lieu et horaires du formulaire affichés sous forme de pastilles si aucun sujet n'est fourni.
  const horaires = texte(c?.begins_at) ? (texte(c?.ends_at) ? `${c.begins_at} – ${c.ends_at}` : c.begins_at) : null;
  const infos = [c?.type, c?.place, horaires].map(texte).filter((x): x is string => !!x);
  const sujets = tab(c?.sujets ?? c?.topics).map(lib);

  return {
    resume: typeof c === 'string' ? c : String(c?.resume ?? c?.description ?? c?.summary ?? ''),
    sujets: sujets.length ? sujets : infos,
    decisions: tab(c?.decisions).map((x, i) => ({ id: 'd' + i, libelle: lib(x), segment_id: x?.segment_id ?? null })),
    actions: tab(c?.actions).map((x, i) => ({
      id: 'a' + i,
      libelle: lib(x),
      responsable: texte(x?.responsable ?? x?.owner),
      echeance: texte(x?.echeance ?? x?.deadline),
      statut: 'a_faire' as const,
      segment_id: x?.segment_id ?? null,
    })),
    points_en_suspens: tab(c?.points_en_suspens ?? c?.points ?? c?.questions).map((x, i) => ({
      id: 'p' + i, libelle: lib(x), segment_id: x?.segment_id ?? null,
    })),
    modele: c?.modele ?? c?.model ?? null,
    genere_le: new Date().toISOString(),
  };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private navigateur = isPlatformBrowser(this.platformId);
  private fichiers = new Map<string, File>(); // pour relancer sans redéposer (tant que la page reste ouverte)
  private store$ = new BehaviorSubject<Local[]>(this.charger());

  /** Minuterie active uniquement dans le navigateur. */
  tic(ms: number): Observable<number> {
    return this.navigateur ? timer(0, ms) : EMPTY;
  }

  /** Pas de route /sante : une réponse HTTP < 500 (même 405) prouve que FastAPI répond. */
  sante(): Observable<unknown> {
    return this.http.get(`${API}/transcrire`).pipe(
      catchError(err => (err.status > 0 && err.status < 500 ? of(true) : throwError(() => err)))
    );
  }

  // ---------------------------------------------------------------- Stockage local

  private charger(): Local[] {
    if (!this.navigateur) return [];
    try {
      const l: Local[] = JSON.parse(localStorage.getItem(CLE_REUNIONS) ?? '[]');
      // Un traitement en cours au moment du rechargement de la page est forcément interrompu.
      return l.map(r =>
        estFinal(r.statut)
          ? r
          : { ...r, statut: 'echec' as Statut, etape_echec: r.statut, progression: null,
              erreur: 'Traitement interrompu : la page a été rechargée pendant l\'analyse.' }
      );
    } catch {
      return [];
    }
  }

  private ecrire(l: Local[]): void {
    this.store$.next(l);
    if (this.navigateur) {
      try { localStorage.setItem(CLE_REUNIONS, JSON.stringify(l)); } catch { /* quota dépassé */ }
    }
  }

  private maj(id: string, patch: Partial<Local>): void {
    this.ecrire(this.store$.value.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  private majCr(id: string, fn: (c: CompteRendu) => CompteRendu): void {
    const r = this.store$.value.find(x => x.id === id);
    if (r?.compte_rendu) this.maj(id, { compte_rendu: fn(r.compte_rendu) });
  }

  // ---------------------------------------------------------------- Lecture

  private filtrer(l: Local[], q: string): Local[] {
    const n = normaliser(q.trim());
    if (!n) return l;
    return l.filter(r =>
      normaliser(
        [r.titre, r.compte_rendu?.resume, ...(r.compte_rendu?.decisions.map(d => d.libelle) ?? []),
         ...(r.compte_rendu?.actions.map(a => a.libelle) ?? []), r.texte].filter(Boolean).join(' ')
      ).includes(n)
    );
  }

  liste(q = ''): Observable<ReunionResume[]> {
    return this.store$.pipe(map(l => this.filtrer(l, q)));
  }

  /** La liste se met à jour toute seule à chaque changement de statut. */
  listeLive(q = ''): Observable<ReunionResume[]> {
    return this.liste(q);
  }

  detail(id: string): Observable<Reunion> {
    return this.store$.pipe(
      take(1),
      switchMap(l => { const r = l.find(x => x.id === id); return r ? of(r) : throwError(() => ({ status: 404 })); })
    );
  }

  /** Émet à chaque changement d'état de la réunion, puis s'arrête sur "termine" ou "echec". */
  suivre(id: string): Observable<Reunion> {
    return this.store$.pipe(
      map(l => l.find(r => r.id === id)),
      distinctUntilChanged(),
      switchMap(r => (r ? of(r as Reunion) : throwError(() => ({ status: 404 })))),
      takeWhile(r => !estFinal(r.statut), true)
    );
  }

  // ---------------------------------------------------------------- Traitement

  private formulaire(f: File): FormData {
    const fd = new FormData();
    fd.append(CHAMP_FICHIER, f);
    return fd;
  }

  /**
   * Étape 1 : POST /api/transcrire (avec progression d'envoi).
   * On signale "done" dès que le fichier est envoyé : l'utilisateur est redirigé vers la page de suivi
   * pendant que la transcription et le résumé continuent en arrière-plan.
   */
  deposer(fichier: File, titre: string, date: string): Observable<DepotEvent> {
    return new Observable<DepotEvent>(sub => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      this.fichiers.set(id, fichier);
      this.ecrire([{ id, titre, date, statut: 'en_attente', progression: 0, valide: false, segments: [], compte_rendu: null }, ...this.store$.value]);

      let signale = false;
      const fin = () => { if (!signale) { signale = true; sub.next({ type: 'done', id }); sub.complete(); } };

      this.http.post<any>(`${API}/transcrire`, this.formulaire(fichier), { reportProgress: true, observe: 'events' }).subscribe({
        next: ev => {
          if (ev.type === HttpEventType.UploadProgress) {
            const pct = ev.total ? Math.round((100 * ev.loaded) / ev.total) : 0;
            if (!signale) sub.next({ type: 'progress', pct });
            this.maj(id, pct >= 100 ? { statut: 'transcription', progression: null } : { progression: pct });
            if (pct >= 100) fin();
          } else if (ev.type === HttpEventType.Response) {
            fin();
            this.apresTranscription(id, ev.body);
          }
        },
        error: err => {
          if (!signale) {
            // Échec pendant l'envoi : on n'encombre pas l'historique, on affiche l'erreur dans le formulaire.
            signale = true;
            this.ecrire(this.store$.value.filter(r => r.id !== id));
            sub.error(err);
          } else {
            this.echec(id, 'transcription', err);
          }
        },
      });
    });
  }

  private apresTranscription(id: string, corps: any): void {
    const lu = lireTranscription(corps);
    if (!lu.segments.length) {
      this.echec(id, 'transcription', null, 'Le serveur n\'a renvoyé aucune transcription exploitable.');
      return;
    }
    // Dictionnaire de termes métier (EF04) appliqué ici, avant la génération du résumé.
    const segments = lu.segments.map(s => ({ ...s, texte: this.appliquerGlossaire(s.texte) }));
    const texte = this.appliquerGlossaire(lu.texte);
    const duree = Math.round(Math.max(0, ...segments.map(s => s.fin)));
    this.maj(id, { segments, texte, statut: 'structuration', progression: null, duree_secondes: duree || null });
    this.structurer(id, texte);
  }

  /** Étape 2 : POST /api/generer-resume. */
  private structurer(id: string, texte: string): void {
    this.http.post<any>(`${API}/generer-resume`, { [CHAMP_TEXTE]: texte }).subscribe({
      next: r => {
        const cr = lireCompteRendu(r);
        this.maj(id, { compte_rendu: cr, statut: 'termine', progression: null, nb_decisions: cr.decisions.length, nb_actions: cr.actions.length });
      },
      error: err => this.echec(id, 'structuration', err),
    });
  }

  private echec(id: string, etape: Statut, err: any, message?: string): void {
    this.maj(id, { statut: 'echec', etape_echec: etape, progression: null, erreur: message ?? this.messageErreur(err) });
  }

  private messageErreur(err: any): string {
    const d = err?.error?.detail;
    if (Array.isArray(d)) {
      const champs = d.map((x: any) => `${(x.loc ?? []).join('.')} : ${x.msg}`).join(' ; ');
      return `Le serveur refuse la requête (${champs}). Vérifiez CHAMP_FICHIER et CHAMP_TEXTE dans api.service.ts.`;
    }
    if (typeof d === 'string') return d;
    if (!err?.status || err.status >= 500) return `Le serveur local n'a pas pu traiter la demande (erreur ${err?.status || 'réseau'}). Consultez le terminal de FastAPI.`;
    return `Erreur ${err.status}.`;
  }

  /** Relance sans redéposer : repart de la transcription si elle existe, sinon du fichier gardé en mémoire. */
  relancer(id: string): Observable<unknown> {
    const r = this.store$.value.find(x => x.id === id);
    if (!r) return throwError(() => new Error('introuvable'));
    if (r.texte) {
      this.maj(id, { statut: 'structuration', erreur: null, etape_echec: null, progression: null });
      this.structurer(id, r.texte);
      return of(true);
    }
    const f = this.fichiers.get(id);
    if (f) {
      this.maj(id, { statut: 'transcription', erreur: null, etape_echec: null, progression: null });
      this.http.post<any>(`${API}/transcrire`, this.formulaire(f)).subscribe({
        next: b => this.apresTranscription(id, b),
        error: e => this.echec(id, 'transcription', e),
      });
      return of(true);
    }
    return throwError(() => new Error('fichier indisponible'));
  }

  // ---------------------------------------------------------------- Corrections, validation, export

  majDecision(id: string, decisionId: string, patch: Partial<Decision>): Observable<unknown> {
    this.majCr(id, c => ({ ...c, decisions: c.decisions.map(d => (d.id === decisionId ? { ...d, ...patch } : d)) }));
    return of(true);
  }

  majAction(id: string, actionId: string, patch: Partial<Action>): Observable<unknown> {
    this.majCr(id, c => ({ ...c, actions: c.actions.map(a => (a.id === actionId ? { ...a, ...patch } : a)) }));
    return of(true);
  }

  valider(id: string): Observable<unknown> {
    this.maj(id, { valide: true });
    return of(true);
  }

  /** Pas de route d'export Word côté serveur : l'interface propose alors l'export Markdown. */
  exporterDocx(_id: string): Observable<Blob> {
    return throwError(() => new Error('export Word indisponible'));
  }

  // ---------------------------------------------------------------- Dictionnaire de termes métier (local)

  private lireGlossaire(): TermeMetier[] {
    if (!this.navigateur) return [];
    try { return JSON.parse(localStorage.getItem(CLE_GLOSSAIRE) ?? '[]'); } catch { return []; }
  }

  private appliquerGlossaire(t: string): string {
    return this.lireGlossaire().reduce((s, g) => {
      const terme = g.terme.trim();
      if (!terme) return s;
      const motif = new RegExp(terme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return s.replace(motif, () => g.remplacement);
    }, t);
  }

  glossaire(): Observable<TermeMetier[]> {
    return of(this.lireGlossaire());
  }

  enregistrerGlossaire(termes: TermeMetier[]): Observable<unknown> {
    if (this.navigateur) localStorage.setItem(CLE_GLOSSAIRE, JSON.stringify(termes));
    return of(true);
  }
}