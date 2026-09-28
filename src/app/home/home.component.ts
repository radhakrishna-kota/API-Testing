import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ApiTesterComponent } from '../api-tester/api-tester.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ApiTesterComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  currentUser: string | null = null;
  activePanel: string | null = null;
  activeSubPanel: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
  }

  openPanel(panel: string): void {
    this.activePanel = this.activePanel === panel ? null : panel;
    this.activeSubPanel = null;
  }

  openSubPanel(sub: string): void {
    this.activeSubPanel = this.activeSubPanel === sub ? null : sub;
  }

  goToServiceModules(): void {
    this.router.navigate(['/service-modules']);
  }

  goToResponseAnalysis(): void {
    this.router.navigate(['/response-analysis']);
  }

  goToRequestHistory(): void {
    this.router.navigate(['/request-history']);
  }

  goToDbConfig(): void {
    this.router.navigate(['/db-config']);
  }

  goToDbStoredProcedure(): void {
    this.router.navigate(['/db-stored-procedure']);
  }

  goToAnalyzeSP(): void {
    this.router.navigate(['/analyze-sp']);
  }

  goToSoaServiceCatalog(): void {
    this.router.navigate(['/soa-service-catalog']);
  }

  goToInterviewVerification(): void {
    this.router.navigate(['/interview-verification']);
  }

  goToGeminiInterviewVerification(): void {
    this.router.navigate(['/gemini-interview-verification']);
  }

  goToFreeLlmInterviewVerification(): void {
    this.router.navigate(['/free-llm-interview-verification']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
