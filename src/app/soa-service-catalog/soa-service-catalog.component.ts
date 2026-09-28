import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth.service';
import { ToastService } from '../toast.service';

interface SOARecord {
  sheetName: string;
  rowNumber: number;
  values: Record<string, string>;
  service: string;
  repoName: string;
  serviceType: string;
  databaseType: string;
  pipelineAvailable: string;
  devUrl: string;
  testUrl: string;
  prodUrl: string;
  endUsers: string;
  appConnectionPool: string;
  databaseTokens: string[];
  serverHosts: string[];
}

interface ScenarioInsight {
  title: string;
  reason: string;
  recommendation: string;
  severity: 'high' | 'medium' | 'low';
}

interface DetailField {
  key: string;
  value: string;
}

interface DetailSection {
  title: string;
  fields: DetailField[];
  expanded?: boolean;
}

interface PostmanCollection {
  item?: PostmanItem[];
}

interface PostmanQueryItem {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrlObject {
  raw?: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryItem[];
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: {
    method?: string;
    header?: Array<{ key?: string; value?: string; disabled?: boolean }>;
    body?: {
      mode?: string;
      raw?: string;
    };
    url?: string | PostmanUrlObject;
  };
}

interface CollectionRequest {
  id: string;
  name: string;
  method: string;
  originalUrl: string;
  resolvedUrl: string;
  requestBody: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  queryParams: Array<{ key: string; value: string; enabled: boolean }>;
  status: 'ready' | 'running' | 'success' | 'error' | 'skipped';
  statusText: string;
  responseCode: number | null;
  responseTimeMs: number | null;
  responseBody: string;
}

interface StoredCollectionState {
  fileName: string;
  requests: CollectionRequest[];
  hasSavedHandle: boolean;
}

@Component({
  selector: 'app-soa-service-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './soa-service-catalog.component.html',
  styleUrls: ['./soa-service-catalog.component.css']
})
export class SoaServiceCatalogComponent implements OnInit {
  private readonly postmanStorageKey = 'soaServicePostmanCollections';
  private readonly postmanHandleDbName = 'soaServicePostmanHandles';
  private readonly postmanHandleStoreName = 'handles';

  currentUser: string | null = null;
  loading = false;
  loadError = '';

  allRecords: SOARecord[] = [];
  filteredRecords: SOARecord[] = [];
  visibleColumns: string[] = [];
  availableServices: SOARecord[] = [];
  selectedRecord: SOARecord | null = null;
  selectedRecordSections: DetailSection[] = [];
  collectionRequests: CollectionRequest[] = [];
  selectedExecutionEnvironment: 'dev' | 'test' | 'prod' = 'dev';
  expandedSections: Set<string> = new Set();
  collectionFileName = '';
  isRunningCollection = false;
  hasSavedCollectionLink = false;
  isReloadingLinkedCollection = false;

  // Authentication properties
  allowPostCalls: boolean = false;
  authType: string = 'windows';
  windowsDomain: string = '';
  windowsUsername: string = '';
  windowsPassword: string = '';
  basicUsername: string = '';
  basicPassword: string = '';
  expandedRequestIds: Set<string> = new Set();
  selectedRequestId = '';

  sheetOptions: string[] = [];
  serviceTypeOptions: string[] = [];
  databaseTypeOptions: string[] = [];
  pipelineOptions: string[] = [];
  databaseTokenOptions: string[] = [];
  serverHostOptions: string[] = [];
  appPoolOptions: string[] = [];

  selectedSheet = 'All';
  selectedServiceType = 'All';
  selectedDatabaseType = 'All';
  selectedPipeline = 'All';
  selectedDatabaseToken = 'All';
  selectedServerHost = 'All';
  selectedAppPool = 'All';
  selectedEnvironment = 'All';
  selectedService = 'All';
  textSearch = '';
  usersSearch = '';

  totalCount = 0;
  prodUrlMissingCount = 0;
  noPipelineCount = 0;
  hybridDbCount = 0;

  readonly environmentOptions = ['All', 'Dev', 'Test', 'Prod'];
  readonly fileSystemAccessSupported = typeof window !== 'undefined' && typeof (window as any).showOpenFilePicker === 'function';

  readonly defaultColumns = [
    'Sno',
    'Service',
    'Repo_Name',
    'Pipeline_Available',
    'Service_Type',
    'Database_Type',
    'Dev_URL',
    'Test_URL',
    'Prod_URL',
    'End_Users'
  ];

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadWorkbook();
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  goToServiceModules(): void {
    this.router.navigate(['/service-modules']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  loadMore(): void {
    this.applyFilters();
  }

  resetFilters(): void {
    this.selectedSheet = 'All';
    this.selectedServiceType = 'All';
    this.selectedDatabaseType = 'All';
    this.selectedPipeline = 'All';
    this.selectedDatabaseToken = 'All';
    this.selectedServerHost = 'All';
    this.selectedAppPool = 'All';
    this.selectedEnvironment = 'All';
    this.selectedService = 'All';
    this.textSearch = '';
    this.usersSearch = '';
    this.applyFilters();
  }

  onSheetChanged(): void {
    this.selectedService = 'All';
    this.applyFilters();
  }

  selectService(service: string): void {
    this.selectedService = service;
    this.applyFilters();
  }

  async linkCollectionFile(fileInput: HTMLInputElement): Promise<void> {
    if (!this.selectedRecord) {
      return;
    }

    if (!this.fileSystemAccessSupported) {
      this.openPostmanImporter(fileInput);
      return;
    }

    try {
      const handles = await (window as any).showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'Postman collection',
            accept: {
              'application/json': ['.json']
            }
          }
        ]
      });

      const handle = handles?.[0];
      if (!handle) {
        return;
      }

      await this.loadCollectionFromHandle(handle, true, false);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        this.toastService.show('Unable to link the selected collection file.', 'error', 2800);
      }
    }
  }

  openPostmanImporter(fileInput: HTMLInputElement): void {
    fileInput.value = '';
    fileInput.click();
  }

  onPostmanFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.selectedRecord) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const serviceName = this.selectedRecord?.service || 'selected service';
        const collection = JSON.parse(String(reader.result)) as PostmanCollection;
        const requests = this.parsePostmanCollection(collection);
        if (!requests.length) {
          this.toastService.show('No requests found in the selected Postman collection.', 'warning', 2600);
          return;
        }

        this.collectionFileName = file.name;
        this.hasSavedCollectionLink = false;
        this.collectionRequests = this.applyEnvironmentToRequests(requests);
        this.selectedRequestId = this.collectionRequests[0]?.id || '';
        this.persistCollectionRequests();
        this.toastService.show(`Attached ${requests.length} requests for ${serviceName}.`, 'success', 2600);
      } catch {
        this.toastService.show('Invalid Postman collection file.', 'error', 2800);
      }
    };

    reader.onerror = () => {
      this.toastService.show('Unable to read selected Postman file.', 'error', 2600);
    };

    reader.readAsText(file);
  }

  onExecutionEnvironmentChanged(): void {
    this.collectionRequests = this.applyEnvironmentToRequests(this.collectionRequests);
    this.persistCollectionRequests();
  }

  async reloadSavedCollection(): Promise<void> {
    if (!this.selectedRecord) {
      return;
    }

    const handle = await this.getStoredCollectionHandle(this.getSelectedRecordKey());
    if (!handle) {
      this.toastService.show('No permanently linked collection file was found for this service.', 'warning', 2600);
      return;
    }

    this.isReloadingLinkedCollection = true;
    try {
      await this.loadCollectionFromHandle(handle, false, false, true);
    } finally {
      this.isReloadingLinkedCollection = false;
    }
  }

  async runAllGetCalls(): Promise<void> {
    const runnableRequests = this.collectionRequests.filter(request => {
      return this.isRequestRunnable(request);
    });

    const skippedRequests = this.collectionRequests.filter(request => {
      return !this.isRequestRunnable(request);
    });

    skippedRequests.forEach(request => {
      request.status = 'skipped';
      request.statusText = this.allowPostCalls
        ? 'Skipped: only GET and POST requests are allowed'
        : 'Skipped: only GET requests are allowed';
      request.responseCode = null;
      request.responseTimeMs = null;
      request.responseBody = '';
    });

    if (!runnableRequests.length) {
      const message = this.allowPostCalls
        ? 'No GET or POST requests available to run.'
        : 'No GET requests available to run.';
      this.toastService.show(message, 'warning', 2600);
      return;
    }

    this.isRunningCollection = true;

    for (const request of runnableRequests) {
      await this.executeCollectionRequest(request);
    }

    this.isRunningCollection = false;
    this.persistCollectionRequests();
    const executedCount = runnableRequests.length;
    const message = this.allowPostCalls
      ? `Completed ${executedCount} GET/POST requests for ${this.selectedExecutionEnvironment.toUpperCase()}.`
      : `Completed ${executedCount} GET requests for ${this.selectedExecutionEnvironment.toUpperCase()}.`;
    this.toastService.show(message, 'info', 2800);
  }

  async runSingleRequest(request: CollectionRequest): Promise<void> {
    if (!this.isRequestRunnable(request)) {
      const message = this.allowPostCalls
        ? 'Only GET and POST requests can be run. For POST, keep Enable POST Calls checked.'
        : 'Only GET requests can be run unless Enable POST Calls is checked.';
      this.toastService.show(message, 'warning', 3000);
      request.status = 'skipped';
      request.statusText = this.allowPostCalls ? 'Skipped: non-GET/POST method' : 'Skipped: non-GET method';
      request.responseCode = null;
      request.responseTimeMs = null;
      request.responseBody = '';
      return;
    }

    this.isRunningCollection = true;
    await this.executeCollectionRequest(request);
    this.isRunningCollection = false;
    this.persistCollectionRequests();
    this.toastService.show(`Completed ${request.method} call for ${request.name}.`, 'info', 2400);
  }

  clearAttachedCollection(): void {
    this.collectionRequests = [];
    this.collectionFileName = '';
    this.hasSavedCollectionLink = false;
    this.selectedRequestId = '';
    this.persistCollectionRequests();
    void this.deleteStoredCollectionHandle(this.getSelectedRecordKey());
  }

  toggleRequestExpansion(requestId: string): void {
    if (this.expandedRequestIds.has(requestId)) {
      this.expandedRequestIds.delete(requestId);
    } else {
      this.expandedRequestIds.add(requestId);
    }
  }

  isRequestExpanded(requestId: string): boolean {
    return this.expandedRequestIds.has(requestId);
  }

  setAuthType(type: string): void {
    this.authType = type;
  }

  selectRequest(requestId: string): void {
    this.selectedRequestId = requestId;
  }

  get selectedRequest(): CollectionRequest | null {
    if (!this.collectionRequests.length) {
      return null;
    }

    const selected = this.collectionRequests.find(request => request.id === this.selectedRequestId);
    if (selected) {
      return selected;
    }

    return this.collectionRequests[0];
  }

  getVisibleQueryParams(request: CollectionRequest): Array<{ key: string; value: string; enabled: boolean }> {
    return request.queryParams.filter(param => param.key.trim() || param.value.trim());
  }

  getVisibleHeaders(request: CollectionRequest): Array<{ key: string; value: string; enabled: boolean }> {
    return request.headers.filter(header => header.key.trim() || header.value.trim());
  }

  formatPayload(payload: string): string {
    const trimmed = this.sanitizeValue(payload);
    if (!trimmed) {
      return '';
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return payload;
    }
  }

  private isRequestRunnable(request: CollectionRequest): boolean {
    if (request.method === 'GET') {
      return true;
    }
    if (request.method === 'POST' && this.allowPostCalls) {
      return true;
    }
    return false;
  }

  private async executeCollectionRequest(request: CollectionRequest): Promise<void> {
    request.status = 'running';
    request.statusText = 'Running';
    request.responseCode = null;
    request.responseTimeMs = null;
    request.responseBody = '';

    const startedAt = performance.now();
    try {
      let headers = new HttpHeaders();
      request.headers.filter(header => header.enabled && header.key.trim()).forEach(header => {
        headers = headers.set(header.key, header.value);
      });

      let params = new HttpParams();
      request.queryParams.filter(param => param.enabled && param.key.trim()).forEach(param => {
        params = params.set(param.key, param.value);
      });

      if (this.authType && this.authType !== 'none') {
        const authHeader = this.buildAuthHeader();
        if (authHeader) {
          headers = headers.set('Authorization', authHeader);
        }
      }

      let response;
      if (request.method === 'GET') {
        response = await firstValueFrom(this.http.get(request.resolvedUrl, {
          headers,
          params,
          observe: 'response',
          responseType: 'text'
        }));
      } else if (request.method === 'POST') {
        const body = request.requestBody ? request.requestBody : '';
        response = await firstValueFrom(this.http.post(request.resolvedUrl, body, {
          headers,
          params,
          observe: 'response',
          responseType: 'text'
        }));
      } else {
        throw new Error(`Unsupported HTTP method: ${request.method}`);
      }

      request.status = 'success';
      request.statusText = response.statusText || 'Success';
      request.responseCode = response.status;
      request.responseTimeMs = Math.round(performance.now() - startedAt);
      request.responseBody = typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body ?? '', null, 2);
    } catch (error: any) {
      request.status = 'error';
      request.statusText = error?.statusText || 'Request failed';
      request.responseCode = error?.status || 0;
      request.responseTimeMs = Math.round(performance.now() - startedAt);
      const errorBody = error?.error;
      request.responseBody = typeof errorBody === 'string'
        ? errorBody
        : errorBody
          ? JSON.stringify(errorBody, null, 2)
          : '';
    }
  }

  private buildAuthHeader(): string {
    if (this.authType === 'windows') {
      const credentials = this.windowsUsername
        ? `${this.windowsDomain}${this.windowsDomain ? '\\' : ''}${this.windowsUsername}`
        : '';
      if (!credentials) {
        return '';
      }
      return 'Basic ' + btoa(`${credentials}:${this.windowsPassword}`);
    } else if (this.authType === 'basic') {
      if (!this.basicUsername) {
        return '';
      }
      return 'Basic ' + btoa(`${this.basicUsername}:${this.basicPassword}`);
    }
    return '';
  }

  get scenarioInsights(): ScenarioInsight[] {
    const records = this.filteredRecords;

    const missingProd = records.filter(r => !this.hasValue(r.prodUrl));
    const noPipeline = records.filter(r => this.clean(r.pipelineAvailable) === 'NO');
    const mixedDb = records.filter(r => this.clean(r.databaseType).includes('SQL') && this.clean(r.databaseType).includes('ORACLE'));
    const noRepo = records.filter(r => !this.hasValue(r.repoName));

    const insights: ScenarioInsight[] = [];

    if (missingProd.length > 0) {
      insights.push({
        title: 'Production URL validation required',
        reason: `${missingProd.length} services are missing Prod_URL in the filtered view.`,
        recommendation: 'Validate deployment readiness and update production endpoint inventory before release.',
        severity: 'high'
      });
    }

    if (noPipeline.length > 0) {
      insights.push({
        title: 'Pipeline coverage gap',
        reason: `${noPipeline.length} services are marked with no deployment pipeline.`,
        recommendation: 'Create CI/CD pipelines and map variables per environment for repeatable deployments.',
        severity: 'high'
      });
    }

    if (mixedDb.length > 0) {
      insights.push({
        title: 'Hybrid database dependency',
        reason: `${mixedDb.length} services depend on both SQL and Oracle.`,
        recommendation: 'Document failover strategy and validate cross-database connection secrets per environment.',
        severity: 'medium'
      });
    }

    if (noRepo.length > 0) {
      insights.push({
        title: 'Missing repository traceability',
        reason: `${noRepo.length} services do not have Repo_Name captured.`,
        recommendation: 'Attach source repository metadata to support maintenance and release governance.',
        severity: 'medium'
      });
    }

    if (insights.length === 0) {
      insights.push({
        title: 'Healthy data shape for current filters',
        reason: 'No major gaps detected for production URL, pipeline availability, DB mix, or repository mapping.',
        recommendation: 'Use detailed row view to validate account and access controls before rollout.',
        severity: 'low'
      });
    }

    return insights;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByService(_: number, record: SOARecord): string {
    return `${record.sheetName}-${record.service}-${record.rowNumber}`;
  }

  private loadWorkbook(): void {
    this.loading = true;
    this.loadError = '';

    this.http.get('assets/SOA services information_Final.xlsx', { responseType: 'arraybuffer' }).subscribe({
      next: (buffer) => {
        this.parseWorkbook(buffer);
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Unable to load Excel file from assets. Ensure the workbook exists in src/assets.';
        this.loading = false;
      }
    });
  }

  private parseWorkbook(buffer: ArrayBuffer): void {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const records: SOARecord[] = [];
    const allColumns = new Set<string>();

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      rows.forEach((row, idx) => {
        const values: Record<string, string> = {};
        Object.keys(row).forEach((key) => {
          const normalizedKey = key.trim();
          allColumns.add(normalizedKey);
          values[normalizedKey] = this.sanitizeValue(row[key]);
        });

        const service = this.pickValue(values, ['Service', 'Service1']);
        const repoName = this.pickValue(values, ['Repo_Name']);
        const serviceType = this.pickValue(values, ['Service_Type']);
        const databaseType = this.pickValue(values, ['Database_Type']);
        const pipelineAvailable = this.pickValue(values, ['Pipeline_Available']);
        const devUrl = this.pickValue(values, ['Dev_URL']);
        const testUrl = this.pickValue(values, ['Test_URL']);
        const prodUrl = this.pickValue(values, ['Prod_URL']);
        const endUsers = this.pickValue(values, ['End_Users']);
        const appConnectionPool = this.pickValue(values, ['App_Connection_Pool']);

        const sqlPayload = [
          this.pickValue(values, ['Dev_DataBase_SQL']),
          this.pickValue(values, ['Test_DataBase_SQL']),
          this.pickValue(values, ['Prod_DataBase_SQL']),
          this.pickValue(values, ['DataBase_Oracle'])
        ].join(' ');

        const databaseTokens = this.extractDatabaseTokens(sqlPayload);
        const serverHosts = this.extractServerHosts([devUrl, testUrl, prodUrl]);

        const hasContent = Object.values(values).some(v => this.hasValue(v));
        if (!hasContent) {
          return;
        }

        records.push({
          sheetName,
          rowNumber: idx + 2,
          values,
          service,
          repoName,
          serviceType,
          databaseType,
          pipelineAvailable,
          devUrl,
          testUrl,
          prodUrl,
          endUsers,
          appConnectionPool,
          databaseTokens,
          serverHosts
        });
      });
    });

    this.allRecords = records;
    this.visibleColumns = this.defaultColumns.filter(col => allColumns.has(col));
    this.sheetOptions = ['All', ...this.unique(records.map(r => r.sheetName))];
    this.serviceTypeOptions = ['All', ...this.unique(records.map(r => r.serviceType))];
    this.databaseTypeOptions = ['All', ...this.unique(records.map(r => r.databaseType))];
    this.pipelineOptions = ['All', ...this.unique(records.map(r => r.pipelineAvailable))];
    this.databaseTokenOptions = ['All', ...this.unique(records.flatMap(r => r.databaseTokens))];
    this.serverHostOptions = ['All', ...this.unique(records.flatMap(r => r.serverHosts))];
    this.appPoolOptions = ['All', ...this.unique(records.map(r => r.appConnectionPool))];

    this.applyFilters();
  }

  applyFilters(): void {
    const search = this.clean(this.textSearch);
    const users = this.clean(this.usersSearch);

    const recordsForServiceSelection = this.allRecords.filter(record => {
      const bySheet = this.selectedSheet === 'All' || record.sheetName === this.selectedSheet;
      const byServiceType = this.selectedServiceType === 'All' || record.serviceType === this.selectedServiceType;
      const byDatabase = this.selectedDatabaseType === 'All' || record.databaseType === this.selectedDatabaseType;
      const byPipeline = this.selectedPipeline === 'All' || record.pipelineAvailable === this.selectedPipeline;
      const byDatabaseToken = this.selectedDatabaseToken === 'All' || record.databaseTokens.includes(this.selectedDatabaseToken);
      const byServerHost = this.selectedServerHost === 'All' || record.serverHosts.includes(this.selectedServerHost);
      const byAppPool = this.selectedAppPool === 'All' || record.appConnectionPool === this.selectedAppPool;
      const byEnvironment = this.selectedEnvironment === 'All' || this.matchesEnvironment(record, this.selectedEnvironment);
      const byText = !search || this.clean(this.stringifyRecord(record)).includes(search);
      const byUsers = !users || this.clean(record.endUsers).includes(users);

      return bySheet && byServiceType && byDatabase && byPipeline && byDatabaseToken && byServerHost && byAppPool && byEnvironment && byText && byUsers;
    });

    this.availableServices = Array.from(
      new Map(
        recordsForServiceSelection
          .filter(record => this.hasValue(record.service))
          .map(record => [record.service.toUpperCase(), record])
      ).values()
    ).sort((left, right) => left.service.localeCompare(right.service));

    const availableServiceNames = new Set(this.availableServices.map(record => record.service));
    if (this.selectedService !== 'All' && !availableServiceNames.has(this.selectedService)) {
      this.selectedService = 'All';
    }

    this.filteredRecords = recordsForServiceSelection.filter(record => {
      const bySheet = this.selectedSheet === 'All' || record.sheetName === this.selectedSheet;
      const byServiceType = this.selectedServiceType === 'All' || record.serviceType === this.selectedServiceType;
      const byDatabase = this.selectedDatabaseType === 'All' || record.databaseType === this.selectedDatabaseType;
      const byPipeline = this.selectedPipeline === 'All' || record.pipelineAvailable === this.selectedPipeline;
      const byDatabaseToken = this.selectedDatabaseToken === 'All' || record.databaseTokens.includes(this.selectedDatabaseToken);
      const byServerHost = this.selectedServerHost === 'All' || record.serverHosts.includes(this.selectedServerHost);
      const byAppPool = this.selectedAppPool === 'All' || record.appConnectionPool === this.selectedAppPool;
      const byEnvironment = this.selectedEnvironment === 'All' || this.matchesEnvironment(record, this.selectedEnvironment);
      const byService = this.selectedService === 'All' || record.service === this.selectedService;
      const byText = !search || this.clean(this.stringifyRecord(record)).includes(search);
      const byUsers = !users || this.clean(record.endUsers).includes(users);

      return bySheet && byServiceType && byDatabase && byPipeline && byDatabaseToken && byServerHost && byAppPool && byEnvironment && byService && byText && byUsers;
    });

    this.totalCount = this.filteredRecords.length;
    this.prodUrlMissingCount = this.filteredRecords.filter(r => !this.hasValue(r.prodUrl)).length;
    this.noPipelineCount = this.filteredRecords.filter(r => this.clean(r.pipelineAvailable) === 'NO').length;
    this.hybridDbCount = this.filteredRecords.filter(r => {
      const db = this.clean(r.databaseType);
      return db.includes('SQL') && db.includes('ORACLE');
    }).length;

    this.selectedRecord = this.selectedService === 'All' ? null : (this.filteredRecords[0] ?? null);
    this.selectedRecordSections = this.selectedRecord ? this.buildDetailSections(this.selectedRecord) : [];
    this.loadPersistedCollectionRequests();
    void this.tryAutoLoadLinkedCollection();
  }

  valueOf(record: SOARecord, key: string): string {
    if (key === 'Sno') {
      return record.values['Sno'] || String(record.rowNumber - 1);
    }
    return record.values[key] || '';
  }

  badgeClass(severity: ScenarioInsight['severity']): string {
    if (severity === 'high') {
      return 'high';
    }
    if (severity === 'medium') {
      return 'medium';
    }
    return 'low';
  }

  private unique(values: string[]): string[] {
    const set = new Set(values.map(v => this.sanitizeValue(v)).filter(v => this.hasValue(v)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  private sanitizeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  private pickValue(values: Record<string, string>, keys: string[]): string {
    for (const key of keys) {
      if (this.hasValue(values[key])) {
        return values[key];
      }
    }
    return '';
  }

  private stringifyRecord(record: SOARecord): string {
    return [
      record.sheetName,
      record.service,
      record.repoName,
      record.serviceType,
      record.databaseType,
      record.pipelineAvailable,
      record.appConnectionPool,
      ...record.databaseTokens,
      ...record.serverHosts,
      record.devUrl,
      record.testUrl,
      record.prodUrl,
      record.endUsers,
      ...Object.values(record.values)
    ].join(' | ');
  }

  private clean(value: string): string {
    return this.sanitizeValue(value).toUpperCase();
  }

  private hasValue(value: string): boolean {
    const v = this.clean(value);
    return v !== '' && v !== 'NA' && v !== 'N/A' && v !== 'NULL' && v !== '-';
  }

  private buildDetailSections(record: SOARecord): DetailSection[] {
    const sections: DetailSection[] = [];
    this.expandedSections.clear();
    const pushSection = (title: string, keys: string[]): void => {
      const fields = keys
        .map(key => ({ key, value: record.values[key] || '' }))
        .filter(field => this.hasValue(field.value));

      if (fields.length > 0) {
        sections.push({ title, fields, expanded: true });
        this.expandedSections.add(title);
      }
    };

    pushSection('Service Overview', [
      'Sno',
      'Service',
      'Service1',
      'Repo_Name',
      'TFS_Path',
      'Pipeline_Available',
      'Service_Type',
      'Database_Type',
      'Comments'
    ]);

    pushSection('Environment Endpoints', [
      'Dev_URL',
      'Test_URL',
      'Prod_URL',
      'Deployment Validation Check',
      'Pipeline Variable Verification',
      'QNXT Upgrade'
    ]);

    pushSection('Database and Infrastructure', [
      'Dev_DataBase_SQL',
      'Test_DataBase_SQL',
      'Prod_DataBase_SQL',
      'DataBase_Oracle',
      'App_Connection_Pool',
      'App_Pool_Service_Account',
      'Oracle_Service_Account'
    ]);

    pushSection('Security and Access', [
      'Ad_Group',
      'End_Users',
      'Account_Description',
      'Known Credentials',
      'External Libraries'
    ]);

    const usedKeys = new Set(sections.flatMap(section => section.fields.map(field => field.key)));
    const remainingFields = Object.keys(record.values)
      .filter(key => !usedKeys.has(key))
      .map(key => ({ key, value: record.values[key] || '' }))
      .filter(field => this.hasValue(field.value));

    if (remainingFields.length > 0) {
      sections.push({ title: 'Additional Information', fields: remainingFields, expanded: true });
      this.expandedSections.add('Additional Information');
    }

    return sections;
  }

  toggleSectionExpanded(sectionTitle: string): void {
    if (this.expandedSections.has(sectionTitle)) {
      this.expandedSections.delete(sectionTitle);
    } else {
      this.expandedSections.add(sectionTitle);
    }
  }

  isSectionExpanded(sectionTitle: string): boolean {
    return this.expandedSections.has(sectionTitle);
  }

  private parsePostmanCollection(collection: PostmanCollection): CollectionRequest[] {
    const requestItems = this.flattenPostmanRequests(collection.item || []);

    return requestItems.map((item, index) => {
      const request = item.request || {};
      const method = (request.method || 'GET').toUpperCase();
      const originalUrl = this.extractPostmanUrl(request.url);
      const queryParams = this.extractPostmanQueryParams(request.url);
      const headers = (request.header || []).map(header => ({
        key: header.key || '',
        value: header.value || '',
        enabled: !header.disabled && !!header.key
      }));

      return {
        id: `collection-${Date.now()}-${index}`,
        name: item.name || `Request ${index + 1}`,
        method,
        originalUrl,
        resolvedUrl: '',
        requestBody: request.body?.mode === 'raw' ? (request.body.raw || '') : '',
        headers: headers.length ? headers : [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        queryParams,
        status: 'ready',
        statusText: method === 'GET' ? 'Ready to run' : `Ready (${method} - requires auth)`,
        responseCode: null,
        responseTimeMs: null,
        responseBody: ''
      };
    });
  }

  private flattenPostmanRequests(items: PostmanItem[]): PostmanItem[] {
    const requests: PostmanItem[] = [];

    for (const item of items) {
      if (item.request) {
        requests.push(item);
      }
      if (item.item?.length) {
        requests.push(...this.flattenPostmanRequests(item.item));
      }
    }

    return requests;
  }

  private extractPostmanUrl(url: string | PostmanUrlObject | undefined): string {
    if (!url) {
      return '';
    }

    if (typeof url === 'string') {
      return url;
    }

    if (url.raw) {
      return url.raw;
    }

    const protocol = url.protocol || 'https';
    const host = (url.host || []).join('.');
    const path = (url.path || []).join('/');
    if (!host) {
      return '';
    }

    return `${protocol}://${host}${path ? `/${path}` : ''}`;
  }

  private extractPostmanQueryParams(url: string | PostmanUrlObject | undefined): Array<{ key: string; value: string; enabled: boolean }> {
    if (!url || typeof url === 'string' || !url.query?.length) {
      return [{ key: '', value: '', enabled: true }];
    }

    const query = url.query
      .filter(item => !!item.key)
      .map(item => ({
        key: item.key || '',
        value: item.value || '',
        enabled: !item.disabled
      }));

    return query.length ? [...query, { key: '', value: '', enabled: true }] : [{ key: '', value: '', enabled: true }];
  }

  private applyEnvironmentToRequests(requests: CollectionRequest[]): CollectionRequest[] {
    const baseUrl = this.getSelectedEnvironmentBaseUrl();
    return requests.map(request => ({
      ...request,
      resolvedUrl: this.resolveRequestUrlForEnvironment(request.originalUrl, baseUrl),
      status: request.method === 'GET' || (request.method === 'POST' && this.allowPostCalls) ? 'ready' : 'skipped',
      statusText: request.method === 'GET' || (request.method === 'POST' && this.allowPostCalls)
        ? `Ready for ${this.selectedExecutionEnvironment.toUpperCase()}`
        : this.allowPostCalls
          ? 'Skipped: non-GET/POST method'
          : 'Skipped: non-GET method',
      responseCode: null,
      responseTimeMs: null,
      responseBody: ''
    }));
  }

  private getSelectedEnvironmentBaseUrl(): string {
    if (!this.selectedRecord) {
      return '';
    }

    const source = this.selectedExecutionEnvironment === 'dev'
      ? this.selectedRecord.devUrl
      : this.selectedExecutionEnvironment === 'test'
        ? this.selectedRecord.testUrl
        : this.selectedRecord.prodUrl;

    const matches = this.sanitizeValue(source).match(/https?:\/\/[^\s,]+/i);
    return matches ? matches[0] : '';
  }

  private resolveRequestUrlForEnvironment(originalUrl: string, environmentBaseUrl: string): string {
    if (!originalUrl.trim()) {
      return environmentBaseUrl;
    }

    if (!environmentBaseUrl) {
      return originalUrl;
    }

    try {
      const envUrl = new URL(environmentBaseUrl);
      const sourceUrl = new URL(originalUrl);
      return `${envUrl.protocol}//${envUrl.host}${sourceUrl.pathname}${sourceUrl.search}`;
    } catch {
      const normalizedBase = environmentBaseUrl.replace(/\/+$/, '');
      const normalizedPath = originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`;
      return `${normalizedBase}${normalizedPath}`;
    }
  }

  private loadPersistedCollectionRequests(): void {
    if (!this.selectedRecord) {
      this.collectionRequests = [];
      this.collectionFileName = '';
      this.selectedRequestId = '';
      return;
    }

    const raw = localStorage.getItem(this.postmanStorageKey);
    if (!raw) {
      this.collectionRequests = [];
      this.collectionFileName = '';
      this.selectedRequestId = '';
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, StoredCollectionState>;
      const saved = parsed[this.getSelectedRecordKey()];
      this.collectionFileName = saved?.fileName || '';
      this.hasSavedCollectionLink = !!saved?.hasSavedHandle;
      this.collectionRequests = saved?.requests ? this.applyEnvironmentToRequests(saved.requests) : [];
      this.selectedRequestId = this.collectionRequests[0]?.id || '';
    } catch {
      this.collectionRequests = [];
      this.collectionFileName = '';
      this.hasSavedCollectionLink = false;
      this.selectedRequestId = '';
    }
  }

  private persistCollectionRequests(): void {
    if (!this.selectedRecord) {
      return;
    }

    const raw = localStorage.getItem(this.postmanStorageKey);
    let parsed: Record<string, StoredCollectionState> = {};

    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, StoredCollectionState>;
      } catch {
        parsed = {};
      }
    }

    parsed[this.getSelectedRecordKey()] = {
      fileName: this.collectionFileName,
      hasSavedHandle: this.hasSavedCollectionLink,
      requests: this.collectionRequests.map(request => ({
        ...request,
        status: request.method === 'GET' || (request.method === 'POST' && this.allowPostCalls) ? 'ready' : 'skipped',
        statusText: request.method === 'GET' ||  (request.method === 'POST' && this.allowPostCalls) ? 'Ready to run' : 'Skipped: non-GET method',
        responseCode: null,
        responseTimeMs: null,
        responseBody: ''
      }))
    };

    localStorage.setItem(this.postmanStorageKey, JSON.stringify(parsed));
  }

  private getSelectedRecordKey(): string {
    return `${this.selectedRecord?.sheetName || 'none'}::${this.selectedRecord?.service || 'none'}`;
  }

  private async tryAutoLoadLinkedCollection(): Promise<void> {
    if (!this.selectedRecord || !this.hasSavedCollectionLink) {
      return;
    }

    const handle = await this.getStoredCollectionHandle(this.getSelectedRecordKey());
    if (!handle) {
      this.hasSavedCollectionLink = false;
      this.persistCollectionRequests();
      return;
    }

    const hasPermission = await this.ensureHandlePermission(handle, false);
    if (!hasPermission) {
      return;
    }

    await this.loadCollectionFromHandle(handle, false, true);
  }

  private async loadCollectionFromHandle(handle: any, persistHandle: boolean, suppressToast: boolean, requestPermission: boolean = false): Promise<void> {
    if (!this.selectedRecord) {
      return;
    }

    const permissionGranted = await this.ensureHandlePermission(handle, requestPermission || persistHandle);
    if (!permissionGranted) {
      if (!suppressToast) {
        this.toastService.show('Read permission was not granted for the linked collection file.', 'warning', 2600);
      }
      return;
    }

    const file = await handle.getFile();
    const text = await file.text();
    const collection = JSON.parse(text) as PostmanCollection;
    const requests = this.parsePostmanCollection(collection);

    if (!requests.length) {
      if (!suppressToast) {
        this.toastService.show('No requests found in the linked Postman collection.', 'warning', 2600);
      }
      return;
    }

    this.collectionFileName = file.name;
    this.hasSavedCollectionLink = true;
    this.collectionRequests = this.applyEnvironmentToRequests(requests);
    this.selectedRequestId = this.collectionRequests[0]?.id || '';

    if (persistHandle) {
      await this.saveCollectionHandle(this.getSelectedRecordKey(), handle);
    }

    this.persistCollectionRequests();

    if (!suppressToast) {
      this.toastService.show(`Loaded ${requests.length} requests from ${file.name}.`, 'success', 2600);
    }
  }

  private async ensureHandlePermission(handle: any, requestPermission: boolean): Promise<boolean> {
    if (!handle?.queryPermission) {
      return true;
    }

    const queryState = await handle.queryPermission({ mode: 'read' });
    if (queryState === 'granted') {
      return true;
    }

    if (!requestPermission || !handle.requestPermission) {
      return false;
    }

    const requestState = await handle.requestPermission({ mode: 'read' });
    return requestState === 'granted';
  }

  private openHandleDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.postmanHandleDbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.postmanHandleStoreName)) {
          db.createObjectStore(this.postmanHandleStoreName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async saveCollectionHandle(key: string, handle: any): Promise<void> {
    const db = await this.openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.postmanHandleStoreName, 'readwrite');
      tx.objectStore(this.postmanHandleStoreName).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  private async getStoredCollectionHandle(key: string): Promise<any | null> {
    const db = await this.openHandleDb();
    const value = await new Promise<any | null>((resolve, reject) => {
      const tx = db.transaction(this.postmanHandleStoreName, 'readonly');
      const request = tx.objectStore(this.postmanHandleStoreName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  }

  private async deleteStoredCollectionHandle(key: string): Promise<void> {
    const db = await this.openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.postmanHandleStoreName, 'readwrite');
      tx.objectStore(this.postmanHandleStoreName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  private matchesEnvironment(record: SOARecord, environment: string): boolean {
    if (environment === 'Dev') {
      return this.hasValue(record.devUrl);
    }
    if (environment === 'Test') {
      return this.hasValue(record.testUrl);
    }
    if (environment === 'Prod') {
      return this.hasValue(record.prodUrl);
    }
    return true;
  }

  private extractServerHosts(urlFields: string[]): string[] {
    const urlRegex = /https?:\/\/[^\s,]+/gi;
    const hosts = new Set<string>();

    urlFields.forEach(field => {
      const matches = field.match(urlRegex) || [];
      matches.forEach(urlText => {
        try {
          const host = new URL(urlText).hostname.toLowerCase();
          if (this.hasValue(host)) {
            hosts.add(host);
          }
        } catch {
          // Ignore malformed URLs and continue parsing other entries.
        }
      });
    });

    return Array.from(hosts).sort((a, b) => a.localeCompare(b));
  }

  private extractDatabaseTokens(sqlPayload: string): string[] {
    const tokens = new Set<string>();
    const cleaned = this.sanitizeValue(sqlPayload);

    const connMatches = cleaned.match(/[A-Za-z0-9_]+ConnectionString/gi) || [];
    connMatches.forEach(token => tokens.add(token));

    const sourceMatches = cleaned.match(/Data Source\s*=\s*([A-Za-z0-9_.\\-]+)/gi) || [];
    sourceMatches.forEach(match => {
      const parts = match.split('=');
      const value = this.sanitizeValue(parts[1] || '');
      if (this.hasValue(value)) {
        tokens.add(value);
      }
    });

    return Array.from(tokens).sort((a, b) => a.localeCompare(b));
  }
}
