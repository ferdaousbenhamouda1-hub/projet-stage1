import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReunionService {
  // L'adresse de ton API FastAPI en local
  private apiUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  // Fonction pour envoyer le fichier audio et les infos à Python
  uploadAndProcessAudio(file: File, title: string, date: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('date', date);

    return this.http.post(`${this.apiUrl}/api/process-meeting`, formData);
  }
}