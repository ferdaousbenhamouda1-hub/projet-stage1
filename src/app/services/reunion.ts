import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReunionService {
  private baseUrl = 'http://localhost:8000/api'; // Ajuste selon ton port FastAPI si besoin

  constructor(private http: HttpClient) {}

  transcrireAudio(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.baseUrl}/transcrire`, formData);
  }

  genererResume(texte: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/generer-resume`, { texte });
  }
}