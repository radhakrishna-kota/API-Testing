import { Component, OnInit, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { ApiExecutionSummary, ApiTesterComponent, ApiTesterState } from '../api-tester/api-tester.component';
import { ResponseAnalysisService } from '../response-analysis/response-analysis.service';
import { ToastService } from '../toast.service';

interface ModuleApi {
  id: string;
  name: string;
  enabled: boolean;
  expanded: boolean;
  addedBy: string;
  addedAt: string;
  request: ApiTesterState;
}

interface ServiceModule {
  id: string;
  name: string;
  description: string;
  apis: ModuleApi[];
}

interface ServiceModulesSeed {
  modules: Array<{
    name: string;
    description: string;
    apis?: Array<{
      name?: string;
      enabled?: boolean;
      expanded?: boolean;
      addedBy?: string;
      addedAt?: string;
      request?: Partial<ApiTesterState>;
    }>;
  }>;
}

type EnvironmentName = 'dev' | 'test' | 'prod';

interface EnvironmentConfig {
  serverAddress: string;
  applicationName: string;
  domain: string;
  username: string;
  password: string;
}

interface GlobalApiSettings {
  selectedEnvironment: EnvironmentName;
  environments: Record<EnvironmentName, EnvironmentConfig>;
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

@Component({
  selector: 'app-service-modules',
  standalone: true,
  imports: [CommonModule, FormsModule, ApiTesterComponent],
  templateUrl: './service-modules.component.html',
  styleUrls: ['./service-modules.component.css']
})
export class ServiceModulesComponent implements OnInit {
  @ViewChildren(ApiTesterComponent) apiTesters!: QueryList<ApiTesterComponent>;
  private readonly storageKey = 'serviceModulesConfig';
  private readonly globalSettingsStorageKey = 'globalApiSettings';
  private seedByName: Record<string, ServiceModule> = {};

  currentUser: string | null = null;
  modules: ServiceModule[] = [];
  selectedModuleId: string = '';
  customModuleName: string = '';
  isRunningAll: boolean = false;
  readonly environmentOptions: EnvironmentName[] = ['dev', 'test', 'prod'];
  globalSettings: GlobalApiSettings = this.createDefaultGlobalSettings();

  constructor(
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private responseAnalysisService: ResponseAnalysisService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadGlobalSettings();
    this.loadModules();
  }

  get selectedModule(): ServiceModule | null {
    return this.modules.find(m => m.id === this.selectedModuleId) ?? null;
  }

  selectModule(moduleId: string): void {
    this.selectedModuleId = moduleId;
  }

  addPresetModule(name: string): void {
    if (this.isModuleNameTaken(name)) {
      this.toastService.show(`Module '${name}' already exists.`, 'warning', 2500);
      return;
    }

    const module = this.createModule(name, `Configure and test ${name.toLowerCase()} APIs`);
    this.modules.push(module);
    this.selectedModuleId = module.id;
    this.toastService.show(`Module '${name}' added.`, 'success', 2200);
  }

  addCustomModule(): void {
    const name = this.customModuleName.trim();
    if (!name) {
      return;
    }

    if (this.isModuleNameTaken(name)) {
      this.toastService.show(`Module '${name}' already exists.`, 'warning', 2500);
      return;
    }

    this.addPresetModule(name);
    this.customModuleName = '';
  }

  removeSelectedModule(): void {
    if (!this.selectedModule) {
      return;
    }

    this.modules = this.modules.filter(m => m.id !== this.selectedModuleId);
    this.selectedModuleId = this.modules.length ? this.modules[0].id : '';
  }

  addApi(module: ServiceModule): void {
    module.apis.push(this.createApi(module.apis.length + 1));
    this.toastService.show(`Added API in ${module.name}.`, 'success', 1800);
  }

  openPostmanImporter(fileInput: HTMLInputElement): void {
    fileInput.value = '';
    fileInput.click();
  }

  onPostmanFileSelected(event: Event, module: ServiceModule): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const collection = JSON.parse(String(reader.result)) as PostmanCollection;
        const importedApis = this.parsePostmanCollection(collection, module.name, module.apis.length + 1);

        if (!importedApis.length) {
          this.toastService.show(`No requests found for module '${module.name}' in collection.`, 'warning', 2800);
          return;
        }

        module.apis.push(...importedApis);
        this.persistModulesToStorage();
        this.toastService.show(`Imported ${importedApis.length} APIs into ${module.name}.`, 'success', 2600);
      } catch {
        this.toastService.show('Invalid Postman collection file.', 'error', 2800);
      }
    };

    reader.onerror = () => {
      this.toastService.show('Unable to read selected file.', 'error', 2600);
    };

    reader.readAsText(file);
  }

  removeApi(module: ServiceModule, apiId: string): void {
    module.apis = module.apis.filter(api => api.id !== apiId);
  }

  onApiStateChange(api: ModuleApi, state: ApiTesterState): void {
    api.request = this.cloneRequestState(state);
  }

  onApiRequestCompleted(moduleName: string, api: ModuleApi, result: ApiExecutionSummary): void {
    this.responseAnalysisService.log({
      moduleName,
      apiName: api.name,
      status: result.status,
      statusText: result.statusText,
      method: result.method,
      url: result.url,
      responseTimeMs: result.time,
      success: result.isSuccess,
      executedAt: result.timestamp
    });

    if (!result.isSuccess && api.enabled) {
      api.enabled = false;
      this.persistModulesToStorage();
    }
  }

  runApiAtIndex(index: number): void {
    const tester = this.apiTesters.toArray()[index];
    if (tester) {
      tester.sendRequest();
    }
  }

  toggleApiSection(api: ModuleApi): void {
    api.expanded = !api.expanded;
  }

  runAllInModule(module: ServiceModule): void {
    const testers = this.apiTesters.toArray();
    for (let index = 0; index < module.apis.length; index++) {
      if (module.apis[index].enabled && testers[index]) {
        testers[index].sendRequest();
      }
    }
    this.toastService.show(`Triggered testing for enabled APIs in ${module.name}.`, 'info', 2200);
  }

  runAllModules(): void {
    if (!this.selectedModule) {
      this.toastService.show('Please select a module to test.', 'warning', 2400);
      return;
    }

    this.runAllInModule(this.selectedModule);
  }

  saveGlobalSettings(): void {
    this.persistGlobalSettings();
    this.toastService.show(`Global settings saved for ${this.globalSettings.selectedEnvironment.toUpperCase()}.`, 'success', 2200);
  }

  onEnvironmentChanged(): void {
    this.persistGlobalSettings();
    this.toastService.show(`Environment switched to ${this.globalSettings.selectedEnvironment.toUpperCase()}.`, 'info', 2000);
  }

  saveSelectedModule(): void {
    if (!this.selectedModule) {
      this.toastService.show('No module selected to save.', 'warning', 2200);
      return;
    }

    this.syncVisibleApiStates();
    this.persistModulesToStorage();
    this.toastService.show(`Saved '${this.selectedModule.name}' APIs.`, 'success', 2200);
  }

  removeSavedSelectedModule(): void {
    const selected = this.selectedModule;
    if (!selected) {
      this.toastService.show('No module selected.', 'warning', 2200);
      return;
    }

    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.toastService.show('No saved module data found.', 'info', 2200);
      return;
    }

    const savedModules = this.parseStoredModules(raw);
    const filtered = savedModules.filter(module => module.name.toLowerCase() !== selected.name.toLowerCase());
    localStorage.setItem(this.storageKey, JSON.stringify(filtered));

    const seed = this.seedByName[selected.name.toLowerCase()];
    selected.apis = seed ? seed.apis.map(api => this.cloneApi(api)) : [this.createApi(1)];

    this.toastService.show(`Removed saved data for '${selected.name}'.`, 'info', 2500);
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private createModule(name: string, description: string): ServiceModule {
    return {
      id: this.generateId(name),
      name,
      description,
      apis: [this.createApi(1)]
    };
  }

  private createApi(index: number): ModuleApi {
    const now = new Date().toISOString();
    return {
      id: this.generateId(`api-${index}`),
      name: `API ${index}`,
      enabled: true,
      expanded: true,
      addedBy: this.resolveAddedBy(),
      addedAt: now,
      request: this.createDefaultRequestState()
    };
  }

  private loadModules(): void {
    this.http.get<ServiceModulesSeed>('assets/service-modules.json').subscribe({
      next: (seed) => {
        const seedModules = this.mapSeedToModules(seed);
        this.seedByName = seedModules.reduce<Record<string, ServiceModule>>((acc, module) => {
          acc[module.name.toLowerCase()] = this.cloneModule(module);
          return acc;
        }, {});

        const storedRaw = localStorage.getItem(this.storageKey);
        if (storedRaw) {
          const stored = this.parseStoredModules(storedRaw);
          this.modules = stored.length ? stored : seedModules;
        } else {
          this.modules = seedModules;
        }

        this.ensureSelectedModule();
      },
      error: () => {
        this.modules = [
          this.createModule('Claims', 'Configure and test claim APIs'),
          this.createModule('Provider', 'Configure and test provider APIs')
        ];
        this.ensureSelectedModule();
      }
    });
  }

  private createDefaultGlobalSettings(): GlobalApiSettings {
    return {
      selectedEnvironment: 'dev',
      environments: {
        dev: {
          serverAddress: '',
          applicationName: '',
          domain: '',
          username: '',
          password: ''
        },
        test: {
          serverAddress: '',
          applicationName: '',
          domain: '',
          username: '',
          password: ''
        },
        prod: {
          serverAddress: '',
          applicationName: '',
          domain: '',
          username: '',
          password: ''
        }
      }
    };
  }

  private loadGlobalSettings(): void {
    const raw = localStorage.getItem(this.globalSettingsStorageKey);
    if (!raw) {
      this.globalSettings = this.createDefaultGlobalSettings();
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<GlobalApiSettings>;
      const defaults = this.createDefaultGlobalSettings();
      const selected = parsed.selectedEnvironment;
      this.globalSettings = {
        selectedEnvironment: selected === 'dev' || selected === 'test' || selected === 'prod' ? selected : defaults.selectedEnvironment,
        environments: {
          dev: {
            serverAddress: parsed.environments?.dev?.serverAddress ?? defaults.environments.dev.serverAddress,
            applicationName: parsed.environments?.dev?.applicationName ?? defaults.environments.dev.applicationName,
            domain: parsed.environments?.dev?.domain ?? defaults.environments.dev.domain,
            username: parsed.environments?.dev?.username ?? defaults.environments.dev.username,
            password: parsed.environments?.dev?.password ?? defaults.environments.dev.password
          },
          test: {
            serverAddress: parsed.environments?.test?.serverAddress ?? defaults.environments.test.serverAddress,
            applicationName: parsed.environments?.test?.applicationName ?? defaults.environments.test.applicationName,
            domain: parsed.environments?.test?.domain ?? defaults.environments.test.domain,
            username: parsed.environments?.test?.username ?? defaults.environments.test.username,
            password: parsed.environments?.test?.password ?? defaults.environments.test.password
          },
          prod: {
            serverAddress: parsed.environments?.prod?.serverAddress ?? defaults.environments.prod.serverAddress,
            applicationName: parsed.environments?.prod?.applicationName ?? defaults.environments.prod.applicationName,
            domain: parsed.environments?.prod?.domain ?? defaults.environments.prod.domain,
            username: parsed.environments?.prod?.username ?? defaults.environments.prod.username,
            password: parsed.environments?.prod?.password ?? defaults.environments.prod.password
          }
        }
      };
    } catch {
      this.globalSettings = this.createDefaultGlobalSettings();
    }
  }

  private persistGlobalSettings(): void {
    localStorage.setItem(this.globalSettingsStorageKey, JSON.stringify(this.globalSettings));
  }

  private ensureSelectedModule(): void {
    this.selectedModuleId = this.modules.length ? this.modules[0].id : '';
  }

  private mapSeedToModules(seed: ServiceModulesSeed): ServiceModule[] {
    if (!seed?.modules?.length) {
      return [
        this.createModule('Claims', 'Configure and test claim APIs'),
        this.createModule('Provider', 'Configure and test provider APIs')
      ];
    }

    return seed.modules.map(module => ({
      id: this.generateId(module.name),
      name: module.name,
      description: module.description,
      apis: (module.apis?.length ? module.apis : [{ name: 'API 1' }]).map((api, index) => ({
        id: this.generateId(`api-${index + 1}`),
        name: api.name || `API ${index + 1}`,
        enabled: api.enabled ?? true,
        expanded: api.expanded ?? true,
        addedBy: this.resolveAddedBy(api.addedBy),
        addedAt: api.addedAt || new Date().toISOString(),
        request: this.mergeRequestState(api.request)
      }))
    }));
  }

  private parseStoredModules(raw: string): ServiceModule[] {
    try {
      const parsed = JSON.parse(raw) as ServiceModule[];
      return (parsed || []).map(module => ({
        id: this.generateId(module.name),
        name: module.name,
        description: module.description,
        apis: (module.apis || []).map((api, index) => ({
          id: this.generateId(`api-${index + 1}`),
          name: api.name || `API ${index + 1}`,
          enabled: api.enabled ?? true,
          expanded: api.expanded ?? true,
          addedBy: this.resolveAddedBy(api.addedBy),
          addedAt: api.addedAt || new Date().toISOString(),
          request: this.mergeRequestState(api.request)
        }))
      }));
    } catch {
      return [];
    }
  }

  private persistModulesToStorage(): void {
    const payload = this.modules.map(module => ({
      name: module.name,
      description: module.description,
      apis: module.apis.map(api => ({
        name: api.name,
        enabled: api.enabled,
        expanded: api.expanded,
        addedBy: api.addedBy,
        addedAt: api.addedAt,
        request: this.cloneRequestState(api.request)
      }))
    }));

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  private syncVisibleApiStates(): void {
    const selected = this.selectedModule;
    if (!selected) {
      return;
    }

    const expandedApis = selected.apis.filter(api => api.expanded);
    const testers = this.apiTesters.toArray();
    expandedApis.forEach((api, index) => {
      if (testers[index]) {
        api.request = this.cloneRequestState(testers[index].getState());
      }
    });
  }

  private createDefaultRequestState(): ApiTesterState {
    return {
      url: '',
      method: 'GET',
      queryParams: [{ key: '', value: '', enabled: true }],
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      requestBody: '',
      activeTab: 'params',
      authType: 'windows',
      windowsDomain: '',
      windowsUsername: '',
      windowsPassword: '',
      basicUsername: '',
      basicPassword: ''
    };
  }

  private mergeRequestState(input?: Partial<ApiTesterState>): ApiTesterState {
    return {
      ...this.createDefaultRequestState(),
      ...input,
      queryParams: (input?.queryParams?.length ? input.queryParams : [{ key: '', value: '', enabled: true }]).map(item => ({
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: item.enabled ?? true
      })),
      headers: (input?.headers?.length ? input.headers : [{ key: 'Content-Type', value: 'application/json', enabled: true }]).map(item => ({
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: item.enabled ?? true
      }))
    };
  }

  private cloneRequestState(state: ApiTesterState): ApiTesterState {
    return {
      ...state,
      queryParams: state.queryParams.map(item => ({ ...item })),
      headers: state.headers.map(item => ({ ...item }))
    };
  }

  private cloneApi(api: ModuleApi): ModuleApi {
    return {
      ...api,
      id: this.generateId(api.name),
      request: this.cloneRequestState(api.request)
    };
  }

  private parsePostmanCollection(collection: PostmanCollection, moduleName: string, startIndex: number): ModuleApi[] {
    const rootItems = collection.item || [];
    const moduleMatch = rootItems.find(item => item.item?.length && item.name?.toLowerCase() === moduleName.toLowerCase());
    const sourceItems = moduleMatch?.item?.length ? moduleMatch.item : rootItems;
    const requestItems = this.flattenPostmanRequests(sourceItems);

    return requestItems.map((item, index) => {
      const request = item.request || {};
      const method = (request.method || 'GET').toUpperCase();
      const url = this.extractPostmanUrl(request.url);
      const queryParams = this.extractPostmanQueryParams(request.url);
      const headers = (request.header || []).map(header => ({
        key: header.key || '',
        value: header.value || '',
        enabled: !header.disabled && !!header.key
      }));
      const normalizedHeaders = headers.length ? headers : [{ key: 'Content-Type', value: 'application/json', enabled: true }];
      const requestBody = request.body?.mode === 'raw' ? (request.body.raw || '') : '';

      return {
        id: this.generateId(`api-postman-${startIndex + index}`),
        name: item.name || `API ${startIndex + index}`,
        enabled: true,
        expanded: true,
        addedBy: this.currentUser || 'Unknown',
        addedAt: new Date().toISOString(),
        request: {
          ...this.createDefaultRequestState(),
          method,
          url,
          headers: normalizedHeaders,
          queryParams,
          requestBody,
          activeTab: requestBody ? 'body' : 'params'
        }
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
      .filter((item: PostmanQueryItem) => !!item.key)
      .map((item: PostmanQueryItem) => ({
        key: item.key || '',
        value: item.value || '',
        enabled: !item.disabled
      }));

    if (!query.length) {
      return [{ key: '', value: '', enabled: true }];
    }

    return [...query, { key: '', value: '', enabled: true }];
  }

  trackByModule(_index: number, module: ServiceModule): string {
    return module.id;
  }

  trackByApi(_index: number, api: ModuleApi): string {
    return api.id;
  }

  private cloneModule(module: ServiceModule): ServiceModule {
    return {
      ...module,
      id: this.generateId(module.name),
      apis: module.apis.map(api => this.cloneApi(api))
    };
  }

  private generateId(seed: string): string {
    return `${seed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private isModuleNameTaken(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return this.modules.some(module => module.name.trim().toLowerCase() === normalized);
  }

  private resolveAddedBy(value?: string): string {
    if (!value || value.trim().toLowerCase() === 'system') {
      return this.currentUser || 'Unknown';
    }

    return value;
  }
}
