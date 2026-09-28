import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

interface HistoryApi {
  name: string;
  enabled: boolean;
  addedBy: string;
  addedAt: string;
  request?: {
    method?: string;
    url?: string;
  };
}

interface HistoryModule {
  name: string;
  description: string;
  apis: HistoryApi[];
}

@Component({
  selector: 'app-request-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './request-history.component.html',
  styleUrls: ['./request-history.component.css']
})
export class RequestHistoryComponent implements OnInit {
  private readonly storageKey = 'serviceModulesConfig';

  currentUser: string | null = null;
  modules: HistoryModule[] = [];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadHistory();
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private loadHistory(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.modules = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw) as HistoryModule[];
      this.modules = (parsed || []).map(module => ({
        name: module.name,
        description: module.description,
        apis: (module.apis || []).map((api, index) => ({
          name: api.name || `API ${index + 1}`,
          enabled: api.enabled ?? true,
          addedBy: this.resolveAddedBy(api.addedBy),
          addedAt: api.addedAt || new Date().toISOString(),
          request: {
            method: api.request?.method || 'GET',
            url: api.request?.url || ''
          }
        }))
      }));
    } catch {
      this.modules = [];
    }
  }

  private resolveAddedBy(value?: string): string {
    if (!value || value.trim().toLowerCase() === 'system') {
      return this.currentUser || 'Unknown';
    }

    return value;
  }
}
