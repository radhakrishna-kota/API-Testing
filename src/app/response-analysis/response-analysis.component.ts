import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ApiExecutionDetailRow, ResponseAnalysisService, ModuleStatusSummary } from './response-analysis.service';

type SortColumn = 'period' | 'moduleName' | 'apiName' | 'method' | 'status' | 'success' | 'responseTimeMs' | 'executedAt' | 'url';

@Component({
  selector: 'app-response-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './response-analysis.component.html',
  styleUrls: ['./response-analysis.component.css']
})
export class ResponseAnalysisComponent implements OnInit {
  currentUser: string | null = null;
  selectedGranularity: 'day' | 'month' = 'day';
  moduleSummary: ModuleStatusSummary[] = [];
  detailRows: ApiExecutionDetailRow[] = [];
  filteredRows: ApiExecutionDetailRow[] = [];
  selectedModuleName: string = '';
  selectedStatusFilter: 'all' | 'success' | 'failed' = 'all';
  searchText: string = '';
  sortColumn: SortColumn = 'executedAt';
  sortDirection: 'asc' | 'desc' = 'desc';

  constructor(
    private authService: AuthService,
    private router: Router,
    private responseAnalysisService: ResponseAnalysisService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.refresh();
  }

  setGranularity(granularity: 'day' | 'month'): void {
    this.selectedGranularity = granularity;
    this.refresh();
  }

  refresh(): void {
    const executionSummary = this.responseAnalysisService.getModuleStatusSummary();
    const configuredModules = this.responseAnalysisService.getConfiguredModuleNames();
    const configuredSet = new Set(configuredModules.map(module => module.toLowerCase()));

    const summaryMap = new Map<string, ModuleStatusSummary>();
    executionSummary
      .filter(item => configuredSet.size === 0 || configuredSet.has(item.moduleName.toLowerCase()))
      .forEach(item => {
        summaryMap.set(item.moduleName, item);
      });

    configuredModules.forEach(moduleName => {
      if (!summaryMap.has(moduleName)) {
        summaryMap.set(moduleName, {
          moduleName,
          total: 0,
          success: 0,
          failed: 0,
          avgResponseMs: 0
        });
      }
    });

    this.moduleSummary = Array.from(summaryMap.values()).sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.moduleName.localeCompare(right.moduleName);
    });

    this.detailRows = this.responseAnalysisService
      .getDetailedRows(this.selectedGranularity)
      .filter(row => configuredSet.size === 0 || configuredSet.has(row.moduleName.toLowerCase()));

    if (this.selectedModuleName && !configuredSet.has(this.selectedModuleName.toLowerCase())) {
      this.selectedModuleName = '';
    }

    this.applyFiltersAndSorting();
  }

  selectModule(moduleName: string): void {
    this.selectedModuleName = this.selectedModuleName === moduleName ? '' : moduleName;
    this.applyFiltersAndSorting();
  }

  applyFiltersAndSorting(): void {
    const searchValue = this.searchText.trim().toLowerCase();

    this.filteredRows = this.detailRows
      .filter(row => !this.selectedModuleName || row.moduleName === this.selectedModuleName)
      .filter(row => this.selectedStatusFilter === 'all' || (this.selectedStatusFilter === 'success' ? row.success : !row.success))
      .filter(row => {
        if (!searchValue) {
          return true;
        }

        return [row.moduleName, row.apiName, row.method, row.url, row.statusText, row.period]
          .some(value => value.toLowerCase().includes(searchValue));
      })
      .sort((left, right) => this.compareRows(left, right));
  }

  clearFilters(): void {
    this.selectedStatusFilter = 'all';
    this.searchText = '';
    this.sortColumn = 'executedAt';
    this.sortDirection = 'desc';
    this.applyFiltersAndSorting();
  }

  setSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'executedAt' ? 'desc' : 'asc';
    }

    this.applyFiltersAndSorting();
  }

  downloadData(): void {
    const headers = ['Period', 'Module', 'API', 'Method', 'Status', 'Result', 'ResponseTimeMs', 'ExecutedAt', 'URL'];
    const lines = this.filteredRows.map(row => [
      row.period,
      row.moduleName,
      row.apiName,
      row.method,
      `${row.status} ${row.statusText}`,
      row.success ? 'Success' : 'Failed',
      String(row.responseTimeMs),
      row.executedAt,
      row.url
    ]);

    const csv = [headers, ...lines]
      .map(columns => columns.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `response-analysis-${this.selectedGranularity}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getSortLabel(column: SortColumn): string {
    if (this.sortColumn !== column) {
      return '';
    }

    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  private compareRows(left: ApiExecutionDetailRow, right: ApiExecutionDetailRow): number {
    const leftValue = this.getSortValue(left, this.sortColumn);
    const rightValue = this.getSortValue(right, this.sortColumn);
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return 0;
  }

  private getSortValue(row: ApiExecutionDetailRow, column: SortColumn): number | string {
    switch (column) {
      case 'status':
        return row.status;
      case 'success':
        return row.success ? 1 : 0;
      case 'responseTimeMs':
        return row.responseTimeMs;
      case 'executedAt':
        return row.executedAt;
      default:
        return row[column];
    }
  }
}
