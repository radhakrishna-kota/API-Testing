import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.checkInitialAuthState());
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  // Default credentials
  private readonly DEFAULT_USERNAME = 'admin';
  private readonly DEFAULT_PASSWORD = '123';

  constructor() { }

  login(username: string, password: string): boolean {
    const normalizedUsername = username.trim();

    if (normalizedUsername && password === this.DEFAULT_PASSWORD) {
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('currentUser', normalizedUsername);
      this.isAuthenticatedSubject.next(true);
      return true;
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('currentUser');
    this.isAuthenticatedSubject.next(false);
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  getCurrentUser(): string | null {
    return localStorage.getItem('currentUser');
  }

  getDefaultUsername(): string {
    return this.DEFAULT_USERNAME;
  }

  getDefaultPassword(): string {
    return this.DEFAULT_PASSWORD;
  }

  private checkInitialAuthState(): boolean {
    return localStorage.getItem('isAuthenticated') === 'true';
  }
}
