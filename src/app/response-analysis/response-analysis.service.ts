import { Injectable } from '@angular/core';

export interface ModuleExecutionLog {
  moduleName: string;
  apiName: string;
  status: number;
  statusText: string;
  method: string;
  url: string;
  responseTimeMs: number;
  success: boolean;
  executedAt: string;
}

export interface ModuleStatusSummary {
  moduleName: string;
  total: number;
  success: number;
  failed: number;
  avgResponseMs: number;
}

export interface ModuleTrendRow {
  period: string;
  moduleName: string;
  total: number;
  success: number;
  failed: number;
  avgResponseMs: number;
}

export interface ApiExecutionDetailRow {
  period: string;
  moduleName: string;
  apiName: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  success: boolean;
  responseTimeMs: number;
  executedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ResponseAnalysisService {
  private readonly storageKey = 'moduleApiExecutionLogs';
  private readonly configStorageKey = 'serviceModulesConfig';

  log(entry: ModuleExecutionLog): void {
    const logs = this.getLogs();
    logs.unshift(entry);
    localStorage.setItem(this.storageKey, JSON.stringify(logs.slice(0, 1000)));
  }

  getLogs(): ModuleExecutionLog[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw) as ModuleExecutionLog[];
    } catch {
      return [];
    }
  }

  getModuleStatusSummary(): ModuleStatusSummary[] {
    const grouped = new Map<string, ModuleExecutionLog[]>();

    for (const log of this.getLogs()) {
      const bucket = grouped.get(log.moduleName) ?? [];
      bucket.push(log);
      grouped.set(log.moduleName, bucket);
    }

    return Array.from(grouped.entries())
      .map(([moduleName, logs]) => {
        const total = logs.length;
        const success = logs.filter(log => log.success).length;
        const failed = total - success;
        const avgResponseMs = total
          ? Number((logs.reduce((sum, log) => sum + log.responseTimeMs, 0) / total).toFixed(2))
          : 0;

        return { moduleName, total, success, failed, avgResponseMs };
      })
      .sort((left, right) => right.total - left.total);
  }

  getTrend(granularity: 'day' | 'month'): ModuleTrendRow[] {
    const grouped = new Map<string, ModuleExecutionLog[]>();

    for (const log of this.getLogs()) {
      const date = new Date(log.executedAt);
      const period = granularity === 'day'
        ? date.toISOString().slice(0, 10)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `${period}__${log.moduleName}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(log);
      grouped.set(key, bucket);
    }

    return Array.from(grouped.entries())
      .map(([key, logs]) => {
        const [period, moduleName] = key.split('__');
        const total = logs.length;
        const success = logs.filter(log => log.success).length;
        const failed = total - success;
        const avgResponseMs = total
          ? Number((logs.reduce((sum, log) => sum + log.responseTimeMs, 0) / total).toFixed(2))
          : 0;

        return { period, moduleName, total, success, failed, avgResponseMs };
      })
      .sort((left, right) => right.period.localeCompare(left.period) || left.moduleName.localeCompare(right.moduleName));
  }

  getDetailedRows(granularity: 'day' | 'month'): ApiExecutionDetailRow[] {
    return this.getLogs()
      .map(log => {
        const date = new Date(log.executedAt);
        const period = granularity === 'day'
          ? date.toISOString().slice(0, 10)
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        return {
          period,
          moduleName: log.moduleName,
          apiName: log.apiName,
          method: log.method,
          url: log.url,
          status: log.status,
          statusText: log.statusText,
          success: log.success,
          responseTimeMs: log.responseTimeMs,
          executedAt: log.executedAt
        };
      })
      .sort((left, right) => right.executedAt.localeCompare(left.executedAt));
  }

  getConfiguredModuleNames(): string[] {
    const raw = localStorage.getItem(this.configStorageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<{ name?: string }>;
      const unique = new Set(
        (parsed || [])
          .map(item => (item.name || '').trim())
          .filter(Boolean)
      );
      return Array.from(unique);
    } catch {
      return [];
    }
  }
}
