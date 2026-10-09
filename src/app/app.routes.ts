import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
  {
    path: 'tableau-de-bord',
    title: 'Tableau de bord · ReunionApp',
    loadComponent: () => import('./pages/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'reunions',
    title: 'Réunions · ReunionApp',
    loadComponent: () => import('./pages/meetings.component').then(m => m.MeetingsComponent),
  },
  {
    path: 'reunions/:id',
    title: 'Compte rendu · ReunionApp',
    loadComponent: () => import('./pages/meeting-detail.component').then(m => m.MeetingDetailComponent),
  },
  {
    path: 'parametres',
    title: 'Paramètres · ReunionApp',
    loadComponent: () => import('./pages/settings.component').then(m => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'tableau-de-bord' },
];
