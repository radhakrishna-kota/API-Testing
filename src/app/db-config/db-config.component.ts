import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../toast.service';

export type DbType = 'sqlserver' | 'mysql' | 'postgresql' | 'oracle' | 'sqlite';
export type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

export interface DbServer {
  id: string;
  name: string;
  description: string;
  type: DbType;
  host: string;
  port: number | null;
  databaseName: string;
  username: string;
  password: string;
  connectionTimeout: number;
  connectionStatus: ConnectionStatus;
  connectionMessage: string;
  lastTestedAt: string | null;
  latencyMs: number | null;
}

const DEFAULT_PORTS: Record<DbType, number> = {
  sqlserver: 1433,
  mysql: 3306,
  postgresql: 5432,
  oracle: 1521,
  sqlite: 0
};

@Component({
  selector: 'app-db-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './db-config.component.html',
  styleUrls: ['./db-config.component.css']
})
export class DbConfigComponent implements OnInit {
  private readonly storageKey = 'dbServersConfig';

  currentUser: string | null = null;
  servers: DbServer[] = [];
  selectedServerId: string = '';
  newServerName: string = '';

  readonly dbTypes: { value: DbType; label: string; icon: string }[] = [
    { value: 'sqlserver', label: 'SQL Server',  icon: '🏢' },
    { value: 'mysql',     label: 'MySQL',        icon: '🐬' },
    { value: 'postgresql',label: 'PostgreSQL',   icon: '🐘' },
    { value: 'oracle',    label: 'Oracle DB',    icon: '🔴' },
    { value: 'sqlite',    label: 'SQLite',       icon: '📁' }
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadServers();
  }

  get selectedServer(): DbServer | null {
    return this.servers.find(s => s.id === this.selectedServerId) ?? null;
  }

  selectServer(id: string): void {
    this.selectedServerId = id;
  }

  onTypeChange(server: DbServer): void {
    if (server.type !== 'sqlite') {
      server.port = DEFAULT_PORTS[server.type];
    } else {
      server.port = null;
    }
  }

  addServer(): void {
    const name = this.newServerName.trim();
    if (!name) { return; }
    const exists = this.servers.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      this.toastService.show(`Server '${name}' already exists.`, 'warning', 2500);
      return;
    }
    const server = this.createServer(name);
    this.servers.push(server);
    this.selectedServerId = server.id;
    this.newServerName = '';
    this.saveServers();
    this.toastService.show(`Server '${name}' added.`, 'success', 2000);
  }

  removeServer(id: string): void {
    const idx = this.servers.findIndex(s => s.id === id);
    if (idx === -1) { return; }
    const name = this.servers[idx].name;
    this.servers.splice(idx, 1);
    this.selectedServerId = this.servers[0]?.id ?? '';
    this.saveServers();
    this.toastService.show(`Server '${name}' removed.`, 'info', 2000);
  }

  saveServer(): void {
    this.saveServers();
    this.toastService.show('Server configuration saved.', 'success', 2000);
  }

  testConnection(server: DbServer): void {
    if (!server.host && server.type !== 'sqlite') {
      this.toastService.show('Please enter a host address before testing.', 'warning', 2500);
      return;
    }
    if (server.type !== 'sqlite' && !server.databaseName) {
      this.toastService.show('Please enter a database name before testing.', 'warning', 2500);
      return;
    }

    server.connectionStatus = 'testing';
    server.connectionMessage = 'Connecting…';
    server.latencyMs = null;
    server.lastTestedAt = null;

    const start = Date.now();

    // Simulate network round-trip (frontend-only; replace with real backend call when available)
    const delay = 800 + Math.floor(Math.random() * 600);
    setTimeout(() => {
      const elapsed = Date.now() - start;
      // Basic validation: if host looks valid and credentials present → success simulation
      const hasCredentials = server.type === 'sqlite' || (server.username.trim().length > 0);
      const hostOk = server.type === 'sqlite' || /^[\w\-\.]+$/.test(server.host.trim());

      if (hostOk && hasCredentials) {
        server.connectionStatus = 'success';
        server.connectionMessage = `Connection successful to '${server.type === 'sqlite' ? server.databaseName || 'file' : server.host}'.`;
        server.latencyMs = elapsed;
      } else {
        server.connectionStatus = 'failed';
        server.connectionMessage = !hostOk
          ? `Cannot resolve host '${server.host}'. Check the server address.`
          : `Authentication failed. Verify username and password.`;
        server.latencyMs = null;
      }
      server.lastTestedAt = new Date().toISOString();
      this.saveServers();
    }, delay);
  }

  resetStatus(server: DbServer): void {
    server.connectionStatus = 'idle';
    server.connectionMessage = '';
    server.latencyMs = null;
    server.lastTestedAt = null;
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  trackByServer(_: number, s: DbServer): string { return s.id; }

  getTypeIcon(type: DbType): string {
    return this.dbTypes.find(t => t.value === type)?.icon ?? '🗄️';
  }

  private createServer(name: string): DbServer {
    return {
      id: crypto.randomUUID(),
      name,
      description: '',
      type: 'sqlserver',
      host: '',
      port: DEFAULT_PORTS['sqlserver'],
      databaseName: '',
      username: '',
      password: '',
      connectionTimeout: 30,
      connectionStatus: 'idle',
      connectionMessage: '',
      lastTestedAt: null,
      latencyMs: null
    };
  }

  private loadServers(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.servers = JSON.parse(raw) as DbServer[];
      }
    } catch {
      this.servers = [];
    }
    if (this.servers.length > 0) {
      this.selectedServerId = this.servers[0].id;
    }
  }

  private saveServers(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.servers));
  }
}
