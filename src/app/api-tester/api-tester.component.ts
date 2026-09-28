import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../toast.service';

export interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiTesterState {
  url: string;
  method: string;
  queryParams: KeyValuePair[];
  headers: KeyValuePair[];
  requestBody: string;
  activeTab: string;
  authType: string;
  windowsDomain: string;
  windowsUsername: string;
  windowsPassword: string;
  basicUsername: string;
  basicPassword: string;
}

export interface ApiExecutionSummary {
  status: number;
  statusText: string;
  time: number;
  method: string;
  url: string;
  isSuccess: boolean;
  timestamp: string;
}

export interface GlobalEnvironmentConfig {
  serverAddress?: string;
  applicationName?: string;
  domain: string;
  username: string;
  password: string;
}

interface ApiResponse {
  status: number;
  statusText: string;
  headers: { [key: string]: string };
  body: string;
  time: number;
  size: string;
}

@Component({
  selector: 'app-api-tester',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './api-tester.component.html',
  styleUrls: ['./api-tester.component.css']
})
export class ApiTesterComponent implements OnChanges {
  @Input() initialState: ApiTesterState | null = null;
  @Input() globalEnvironment: GlobalEnvironmentConfig | null = null;
  @Output() stateChange = new EventEmitter<ApiTesterState>();
  @Output() requestCompleted = new EventEmitter<ApiExecutionSummary>();

  private lastAppliedApplicationName: string = '';

  // Request fields
  url: string = '';
  method: string = 'GET';
  methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

  // Query params
  queryParams: KeyValuePair[] = [{ key: '', value: '', enabled: true }];

  // Headers
  headers: KeyValuePair[] = [{ key: 'Content-Type', value: 'application/json', enabled: true }];

  // Request body
  requestBody: string = '';
  activeTab: string = 'params';

  // Auth
  authType: string = 'windows';
  windowsDomain: string = '';
  windowsUsername: string = '';
  windowsPassword: string = '';
  basicUsername: string = '';
  basicPassword: string = '';
  useWindowsAuth: boolean = true;

  // Response
  response: ApiResponse | null = null;
  isLoading: boolean = false;
  activeResponseTab: string = 'body';
  formattedBody: string = '';
  isJsonResponse: boolean = false;

  constructor(
    private http: HttpClient,
    private toastService: ToastService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialState'] && this.initialState) {
      this.applyState(this.initialState, false);
    }

    if (changes['globalEnvironment'] && this.globalEnvironment) {
      this.applyGlobalEnvironmentToFields();
    }
  }

  get hasBody(): boolean {
    return ['POST', 'PUT', 'PATCH'].includes(this.method);
  }

  addQueryParam(): void {
    this.queryParams.push({ key: '', value: '', enabled: true });
    this.emitState();
  }

  removeQueryParam(index: number): void {
    if (this.queryParams.length > 1) {
      this.queryParams.splice(index, 1);
      this.emitState();
    }
  }

  addHeader(): void {
    this.headers.push({ key: '', value: '', enabled: true });
    this.emitState();
  }

  removeHeader(index: number): void {
    if (this.headers.length > 1) {
      this.headers.splice(index, 1);
      this.emitState();
    }
  }

  onUrlChange(): void {
    // Parse URL and extract query params
    try {
      const urlObj = new URL(this.url);
      const params = urlObj.searchParams;
      if (params.toString()) {
        const parsedParams: KeyValuePair[] = [];
        params.forEach((value, key) => {
          parsedParams.push({ key, value, enabled: true });
        });
        parsedParams.push({ key: '', value: '', enabled: true });
        this.queryParams = parsedParams;
        this.emitState();
      }
    } catch {
      // Not a valid URL yet, ignore
    }
  }

  buildFinalUrl(): string {
    const enabledParams = this.queryParams.filter(p => p.enabled && p.key.trim());
    if (!enabledParams.length) return this.url;

    try {
      const urlObj = new URL(this.url);
      enabledParams.forEach(p => urlObj.searchParams.set(p.key, p.value));
      return urlObj.toString();
    } catch {
      const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      return `${this.url}${this.url.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  formatJson(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return '';
  }

  sendRequest(): void {
    if (!this.url.trim()) {
      this.toastService.show('Please enter a URL before sending request.', 'warning', 2500);
      return;
    }

    this.isLoading = true;
    this.response = null;

    let httpHeaders = new HttpHeaders();

    // Add enabled headers
    this.headers.filter(h => h.enabled && h.key.trim()).forEach(h => {
      httpHeaders = httpHeaders.set(h.key, h.value);
    });

    const resolvedDomain = this.windowsDomain.trim() || this.globalEnvironment?.domain?.trim() || '';
    const resolvedUsername = this.windowsUsername.trim() || this.globalEnvironment?.username?.trim() || '';
    const resolvedPassword = this.windowsPassword || this.globalEnvironment?.password || '';
    const resolvedBasicUsername = this.basicUsername.trim() || this.globalEnvironment?.username?.trim() || '';
    const resolvedBasicPassword = this.basicPassword || this.globalEnvironment?.password || '';

    // Basic Auth header
    if (this.authType === 'basic' && resolvedBasicUsername) {
      const encoded = btoa(`${resolvedBasicUsername}:${resolvedBasicPassword}`);
      httpHeaders = httpHeaders.set('Authorization', `Basic ${encoded}`);
    }

    // Windows credentials supplied by user (DOMAIN\username + password)
    if (this.authType === 'windows' && resolvedUsername) {
      const windowsUser = resolvedDomain
        ? `${resolvedDomain}\\${resolvedUsername}`
        : resolvedUsername;
      const encoded = btoa(`${windowsUser}:${resolvedPassword}`);
      httpHeaders = httpHeaders.set('Authorization', `Basic ${encoded}`);
    }

    const finalUrl = this.resolveUrlWithGlobalBase(this.buildFinalUrl());
    const startTime = performance.now();

    const options: any = {
      headers: httpHeaders,
      observe: 'response',
      responseType: 'text',
      withCredentials: this.authType === 'windows'
    };

    const body = this.hasBody ? this.requestBody : null;

    let request$;
    switch (this.method) {
      case 'GET': request$ = this.http.get(finalUrl, options); break;
      case 'POST': request$ = this.http.post(finalUrl, body, options); break;
      case 'PUT': request$ = this.http.put(finalUrl, body, options); break;
      case 'PATCH': request$ = this.http.patch(finalUrl, body, options); break;
      case 'DELETE': request$ = this.http.delete(finalUrl, options); break;
      case 'OPTIONS': request$ = this.http.options(finalUrl, options); break;
      case 'HEAD': request$ = this.http.head(finalUrl, { ...options, responseType: 'text' }); break;
      default: request$ = this.http.get(finalUrl, options);
    }

    request$.subscribe({
      next: (res: any) => {
        const elapsed = performance.now() - startTime;
        const bodyText = res.body ?? '';
        const responseHeaders: { [key: string]: string } = {};
        res.headers.keys().forEach((key: string) => {
          responseHeaders[key] = res.headers.get(key) ?? '';
        });

        this.isJsonResponse = (responseHeaders['content-type'] || '').includes('application/json');
        this.formattedBody = this.isJsonResponse ? this.formatJson(bodyText) : bodyText;

        this.response = {
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
          body: this.formattedBody,
          time: Math.round(elapsed),
          size: this.formatBytes(new Blob([bodyText]).size)
        };
        this.activeResponseTab = 'body';
        this.isLoading = false;

        if (res.status >= 200 && res.status < 300) {
          this.toastService.show(`Request completed with ${res.status}.`, 'success', 2200);
        } else {
          this.toastService.show(`Request completed with ${res.status}.`, 'info', 2200);
        }

        this.requestCompleted.emit({
          status: res.status,
          statusText: res.statusText,
          time: Math.round(elapsed),
          method: this.method,
          url: finalUrl,
          isSuccess: res.status >= 200 && res.status < 300,
          timestamp: new Date().toISOString()
        });
      },
      error: (err: HttpErrorResponse) => {
        const elapsed = performance.now() - startTime;
        const bodyText = err.error ?? '';
        const responseHeaders: { [key: string]: string } = {};
        if (err.headers) {
          err.headers.keys().forEach(key => {
            responseHeaders[key] = err.headers.get(key) ?? '';
          });
        }

        this.isJsonResponse = (responseHeaders['content-type'] || '').includes('application/json');
        this.formattedBody = this.isJsonResponse ? this.formatJson(String(bodyText)) : String(bodyText);

        this.response = {
          status: err.status,
          statusText: err.statusText || 'Error',
          headers: responseHeaders,
          body: this.formattedBody || err.message,
          time: Math.round(elapsed),
          size: '0 B'
        };
        this.activeResponseTab = 'body';
        this.isLoading = false;
        this.toastService.show(`Request failed: ${err.status || 0} ${err.statusText || 'Error'}.`, 'error', 3200);
        this.requestCompleted.emit({
          status: err.status || 0,
          statusText: err.statusText || 'Error',
          time: Math.round(elapsed),
          method: this.method,
          url: finalUrl,
          isSuccess: false,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private resolveUrlWithGlobalBase(url: string): string {
    const trimmedUrl = url.trim();
    const serverAddress = this.globalEnvironment?.serverAddress?.trim() || '';
    const applicationName = this.globalEnvironment?.applicationName?.trim() || '';
    const domain = this.globalEnvironment?.domain?.trim() || '';
    const baseServer = serverAddress || domain;

    if (!trimmedUrl || !baseServer) {
      return trimmedUrl;
    }

    if (/^https?:\/\//i.test(trimmedUrl)) {
      return trimmedUrl;
    }

    const normalizedServer = baseServer.endsWith('/') ? baseServer.slice(0, -1) : baseServer;
    const normalizedApp = applicationName.replace(/^\/+/, '').replace(/\/+$/, '');
    const normalizedPath = trimmedUrl.startsWith('/') ? trimmedUrl : `/${trimmedUrl}`;
    const appSegment = normalizedApp ? `/${normalizedApp}` : '';
    return `${normalizedServer}${appSegment}${normalizedPath}`;
  }

  private applyGlobalEnvironmentToFields(): void {
    const env = this.globalEnvironment;
    if (!env) {
      return;
    }

    const normalizedAppName = (env.applicationName || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const currentPath = this.extractApiPath(this.url, this.lastAppliedApplicationName || normalizedAppName);
    const rebuiltUrl = this.buildAbsoluteUrl(env.serverAddress || env.domain || '', normalizedAppName, currentPath);

    if (rebuiltUrl) {
      this.url = rebuiltUrl;
    }

    this.windowsDomain = env.domain || '';
    this.windowsUsername = env.username || '';
    this.windowsPassword = env.password || '';
    this.basicUsername = env.username || '';
    this.basicPassword = env.password || '';
    this.lastAppliedApplicationName = normalizedAppName;
    this.emitState();
  }

  private buildAbsoluteUrl(serverAddress: string, applicationName: string, apiPath: string): string {
    const normalizedServer = (serverAddress || '').trim().replace(/\/+$/, '');
    if (!normalizedServer) {
      return '';
    }

    const normalizedApp = applicationName.replace(/^\/+/, '').replace(/\/+$/, '');
    const normalizedPath = apiPath.trim().replace(/^\/+/, '');
    const appSegment = normalizedApp ? `/${normalizedApp}` : '';
    const pathSegment = normalizedPath ? `/${normalizedPath}` : '';
    return `${normalizedServer}${appSegment}${pathSegment}`;
  }

  private extractApiPath(url: string, previousApplicationName: string): string {
    const trimmedUrl = (url || '').trim();
    if (!trimmedUrl) {
      return '';
    }

    let path = trimmedUrl;
    if (/^https?:\/\//i.test(trimmedUrl)) {
      try {
        const parsed = new URL(trimmedUrl);
        path = `${parsed.pathname}${parsed.search}`;
      } catch {
        path = trimmedUrl;
      }
    }

    const normalizedPath = path.replace(/^\/+/, '');
    if (!normalizedPath) {
      return '';
    }

    const normalizedPrevApp = (previousApplicationName || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalizedPrevApp && normalizedPath.toLowerCase().startsWith(`${normalizedPrevApp.toLowerCase()}/`)) {
      return normalizedPath.slice(normalizedPrevApp.length + 1);
    }

    if (normalizedPrevApp && normalizedPath.toLowerCase() === normalizedPrevApp.toLowerCase()) {
      return '';
    }

    return normalizedPath;
  }

  clearRequest(): void {
    this.url = '';
    this.method = 'GET';
    this.queryParams = [{ key: '', value: '', enabled: true }];
    this.headers = [{ key: 'Content-Type', value: 'application/json', enabled: true }];
    this.requestBody = '';
    this.response = null;
    this.authType = 'windows';
    this.windowsDomain = '';
    this.windowsUsername = '';
    this.windowsPassword = '';
    this.basicUsername = '';
    this.basicPassword = '';
    this.emitState();
  }

  getHeaderEntries(): [string, string][] {
    return Object.entries(this.response?.headers ?? {});
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.emitState();
  }

  setActiveResponseTab(tab: string): void {
    this.activeResponseTab = tab;
  }

  setAuthType(type: string): void {
    this.authType = type;
    this.emitState();
  }

  getEnabledQueryParamCount(): number {
    return this.queryParams.filter(p => p.enabled && p.key.trim()).length;
  }

  getEnabledHeaderCount(): number {
    return this.headers.filter(h => h.enabled && h.key.trim()).length;
  }

  getState(): ApiTesterState {
    return {
      url: this.url,
      method: this.method,
      queryParams: this.queryParams.map(item => ({ ...item })),
      headers: this.headers.map(item => ({ ...item })),
      requestBody: this.requestBody,
      activeTab: this.activeTab,
      authType: this.authType,
      windowsDomain: this.windowsDomain,
      windowsUsername: this.windowsUsername,
      windowsPassword: this.windowsPassword,
      basicUsername: this.basicUsername,
      basicPassword: this.basicPassword
    };
  }

  onFieldChange(): void {
    this.emitState();
  }

  private applyState(state: ApiTesterState, emit: boolean): void {
    this.url = state.url ?? '';
    this.method = state.method ?? 'GET';
    this.queryParams = (state.queryParams?.length ? state.queryParams : [{ key: '', value: '', enabled: true }]).map(item => ({
      key: item.key ?? '',
      value: item.value ?? '',
      enabled: item.enabled ?? true
    }));
    this.headers = (state.headers?.length ? state.headers : [{ key: 'Content-Type', value: 'application/json', enabled: true }]).map(item => ({
      key: item.key ?? '',
      value: item.value ?? '',
      enabled: item.enabled ?? true
    }));
    this.requestBody = state.requestBody ?? '';
    this.activeTab = state.activeTab ?? 'params';
    this.authType = state.authType ?? 'windows';
    this.windowsDomain = state.windowsDomain ?? '';
    this.windowsUsername = state.windowsUsername ?? '';
    this.windowsPassword = state.windowsPassword ?? '';
    this.basicUsername = state.basicUsername ?? '';
    this.basicPassword = state.basicPassword ?? '';

    if (emit) {
      this.emitState();
    }
  }

  private emitState(): void {
    this.stateChange.emit(this.getState());
  }
}
