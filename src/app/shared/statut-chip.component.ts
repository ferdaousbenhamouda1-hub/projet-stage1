import { Component, Input } from '@angular/core';
import { Statut } from '../core/models';
import { LIBELLE_STATUT } from '../core/utils';

@Component({
  selector: 'app-statut',
  standalone: true,
  template: `<span [class]="'chip ' + vue.cls">{{ vue.txt }}</span>`,
})
export class StatutChipComponent {
  @Input({ required: true }) statut!: Statut;
  @Input() valide = false;

  get vue(): { txt: string; cls: string } {
    if (this.statut === 'echec') return { txt: 'Échec', cls: 'ko' };
    if (this.statut === 'termine') {
      return this.valide ? { txt: 'Validé', cls: 'ok' } : { txt: 'À relire', cls: 'warn' };
    }
    return { txt: LIBELLE_STATUT[this.statut], cls: 'run' };
  }
}