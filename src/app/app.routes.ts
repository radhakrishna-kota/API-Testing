import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { ServiceModulesComponent } from './service-modules/service-modules.component';
import { ResponseAnalysisComponent } from './response-analysis/response-analysis.component';
import { RequestHistoryComponent } from './request-history/request-history.component';
import { DbConfigComponent } from './db-config/db-config.component';
import { DbStoredProcedureComponent } from './db-stored-procedure/db-stored-procedure.component';
import { AnalyzeSPComponent } from './analyze-sp/analyze-sp.component';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'service-modules',
    component: ServiceModulesComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'response-analysis',
    component: ResponseAnalysisComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'request-history',
    component: RequestHistoryComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'db-config',
    component: DbConfigComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'db-stored-procedure',
    component: DbStoredProcedureComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'analyze-sp',
    component: AnalyzeSPComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'soa-service-catalog',
    loadComponent: () => import('./soa-service-catalog/soa-service-catalog.component').then(m => m.SoaServiceCatalogComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'interview-verification',
    loadComponent: () => import('./interview-verification/interview-verification.component').then(m => m.InterviewVerificationComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'gemini-interview-verification',
    loadComponent: () => import('./gemini-interview-verification/gemini-interview-verification.component').then(m => m.GeminiInterviewVerificationComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'free-llm-interview-verification',
    loadComponent: () => import('./free-llm-interview-verification/free-llm-interview-verification.component').then(m => m.FreeLlmInterviewVerificationComponent),
    canActivate: [AuthGuard]
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];
