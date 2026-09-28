import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  severity: ToastSeverity;
  durationMs: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  readonly toasts$ = this.toastsSubject.asObservable();

  show(message: string, severity: ToastSeverity = 'info', durationMs: number = 3000): number {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const toast: ToastMessage = { id, message, severity, durationMs };
    this.toastsSubject.next([...this.toastsSubject.value, toast]);

    setTimeout(() => this.dismiss(id), Math.max(1500, durationMs));
    return id;
  }

  dismiss(id: number): void {
    this.toastsSubject.next(this.toastsSubject.value.filter(toast => toast.id !== id));
  }
}
