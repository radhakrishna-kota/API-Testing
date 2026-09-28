import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../toast.service';

type DbOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
type DbJoinType = 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL JOIN';

interface ProcedureTable {
  id: string;
  name: string;
  alias: string;
}

interface ProcedureWhereClause {
  id: string;
  field: string;
  operator: DbOperator;
  paramName: string;
  sampleValue: string;
}

interface ProcedureJoin {
  id: string;
  leftTableAlias: string;
  joinType: DbJoinType;
  rightTableAlias: string;
  onCondition: string;
}

interface ProcedureOutput {
  id: string;
  expression: string;
  alias: string;
}

interface StoredProcedureConfig {
  id: string;
  name: string;
  procedureName: string;
  tables: ProcedureTable[];
  joins: ProcedureJoin[];
  whereClauses: ProcedureWhereClause[];
  outputColumns: ProcedureOutput[];
  generatedSql: string;
}

@Component({
  selector: 'app-db-stored-procedure',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './db-stored-procedure.component.html',
  styleUrls: ['./db-stored-procedure.component.css']
})
export class DbStoredProcedureComponent implements OnInit {
  private readonly storageKey = 'dbStoredProcedureConfigs';

  currentUser: string | null = null;
  procedures: StoredProcedureConfig[] = [];
  selectedProcedureId: string = '';
  newProcedureName: string = '';
  newTableName: string = '';

  readonly joinTypes: DbJoinType[] = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN'];

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadProcedures();
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  get selectedProcedure(): StoredProcedureConfig | null {
    return this.procedures.find(p => p.id === this.selectedProcedureId) ?? null;
  }

  addProcedure(): void {
    const name = this.newProcedureName.trim();
    if (!name) {
      return;
    }
    const exists = this.procedures.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      this.toastService.show(`Procedure tile '${name}' already exists.`, 'warning', 2500);
      return;
    }
    const proc = this.createProcedure(name);
    this.procedures.push(proc);
    this.selectedProcedureId = proc.id;
    this.newProcedureName = '';
    this.saveProcedures();
  }

  removeProcedure(id: string): void {
    const idx = this.procedures.findIndex(p => p.id === id);
    if (idx === -1) {
      return;
    }
    this.procedures.splice(idx, 1);
    this.selectedProcedureId = this.procedures[0]?.id ?? '';
    this.saveProcedures();
  }

  selectProcedure(id: string): void {
    this.selectedProcedureId = id;
  }

  addTable(proc: StoredProcedureConfig): void {
    const tableName = this.newTableName.trim();
    if (!tableName) {
      return;
    }
    const exists = proc.tables.some(t => t.name.toLowerCase() === tableName.toLowerCase());
    if (exists) {
      this.toastService.show(`Table '${tableName}' already exists.`, 'warning', 2500);
      return;
    }

    const aliasBase = tableName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toLowerCase() || 't';
    let alias = aliasBase;
    let suffix = 1;
    while (proc.tables.some(t => t.alias.toLowerCase() === alias.toLowerCase())) {
      alias = `${aliasBase}${suffix++}`;
    }

    proc.tables.push({
      id: crypto.randomUUID(),
      name: tableName,
      alias
    });
    this.newTableName = '';
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  removeTable(proc: StoredProcedureConfig, tableId: string): void {
    if (proc.tables.length === 1) {
      this.toastService.show('At least one table row is required.', 'warning', 2500);
      return;
    }
    proc.tables = proc.tables.filter(t => t.id !== tableId);
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  addWhereClause(proc: StoredProcedureConfig): void {
    const index = proc.whereClauses.length + 1;
    proc.whereClauses.push({
      id: crypto.randomUUID(),
      field: '',
      operator: '=',
      paramName: `Param${index}`,
      sampleValue: ''
    });
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  addJoin(proc: StoredProcedureConfig): void {
    const aliases = this.getAvailableAliases(proc);
    if (aliases.length < 2) {
      this.toastService.show('Add at least two tables with aliases to define joins.', 'warning', 2500);
      return;
    }

    proc.joins.push({
      id: crypto.randomUUID(),
      leftTableAlias: aliases[0],
      joinType: 'INNER JOIN',
      rightTableAlias: aliases[1],
      onCondition: `${aliases[0]}.Id = ${aliases[1]}.Id`
    });

    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  removeJoin(proc: StoredProcedureConfig, joinId: string): void {
    proc.joins = proc.joins.filter(j => j.id !== joinId);
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  addOutputColumn(proc: StoredProcedureConfig): void {
    proc.outputColumns.push({
      id: crypto.randomUUID(),
      expression: '',
      alias: ''
    });
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  removeOutputColumn(proc: StoredProcedureConfig, outputId: string): void {
    proc.outputColumns = proc.outputColumns.filter(o => o.id !== outputId);
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  removeWhereClause(proc: StoredProcedureConfig, whereId: string): void {
    proc.whereClauses = proc.whereClauses.filter(w => w.id !== whereId);
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  onProcedureInputsChanged(proc: StoredProcedureConfig): void {
    this.generateStoredProcedure(proc);
    this.saveProcedures();
  }

  copyStoredProcedure(proc: StoredProcedureConfig): void {
    if (!proc.generatedSql.trim()) {
      return;
    }
    navigator.clipboard.writeText(proc.generatedSql)
      .then(() => this.toastService.show('Stored procedure copied.', 'success', 1800))
      .catch(() => this.toastService.show('Unable to copy. Please copy manually.', 'warning', 2200));
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  goToAnalyzeSP(): void {
    this.router.navigate(['/analyze-sp']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  trackByProcedure(_: number, p: StoredProcedureConfig): string { return p.id; }
  trackByTable(_: number, t: ProcedureTable): string { return t.id; }
  trackByWhere(_: number, w: ProcedureWhereClause): string { return w.id; }
  trackByJoin(_: number, j: ProcedureJoin): string { return j.id; }
  trackByOutput(_: number, o: ProcedureOutput): string { return o.id; }

  private createProcedure(name: string): StoredProcedureConfig {
    const proc: StoredProcedureConfig = {
      id: crypto.randomUUID(),
      name,
      procedureName: `sp_${name.replace(/[^a-zA-Z0-9]/g, '') || 'Data'}`,
      tables: [{ id: crypto.randomUUID(), name: '', alias: 't1' }],
      joins: [],
      whereClauses: [{ id: crypto.randomUUID(), field: '', operator: '=', paramName: 'Param1', sampleValue: '' }],
      outputColumns: [{ id: crypto.randomUUID(), expression: '', alias: '' }],
      generatedSql: ''
    };
    this.generateStoredProcedure(proc);
    return proc;
  }

  private loadProcedures(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredProcedureConfig[];
        this.procedures = parsed.map(p => this.hydrateProcedure(p));
      }
    } catch {
      this.procedures = [];
    }
    if (this.procedures.length > 0) {
      this.selectedProcedureId = this.procedures[0].id;
    }
  }

  private saveProcedures(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.procedures));
  }

  private hydrateProcedure(proc: StoredProcedureConfig): StoredProcedureConfig {
    const hydrated: StoredProcedureConfig = {
      ...proc,
      procedureName: proc.procedureName || `sp_${(proc.name || 'Data').replace(/[^a-zA-Z0-9]/g, '')}`,
      tables: Array.isArray(proc.tables) && proc.tables.length > 0
        ? proc.tables.map((t, idx) => ({
            id: t.id || crypto.randomUUID(),
            name: t.name || '',
            alias: t.alias || `t${idx + 1}`
          }))
        : [{ id: crypto.randomUUID(), name: '', alias: 't1' }],
      joins: Array.isArray(proc.joins)
        ? proc.joins.map(j => ({
            id: j.id || crypto.randomUUID(),
            leftTableAlias: j.leftTableAlias || '',
            joinType: this.normalizeJoinType(j.joinType),
            rightTableAlias: j.rightTableAlias || '',
            onCondition: j.onCondition || ''
          }))
        : [],
      whereClauses: Array.isArray(proc.whereClauses) && proc.whereClauses.length > 0
        ? proc.whereClauses.map((w, idx) => ({
            id: w.id || crypto.randomUUID(),
            field: w.field || '',
            operator: this.normalizeOperator(w.operator),
            paramName: w.paramName || `Param${idx + 1}`,
            sampleValue: w.sampleValue || ''
          }))
        : [{ id: crypto.randomUUID(), field: '', operator: '=', paramName: 'Param1', sampleValue: '' }],
      outputColumns: Array.isArray(proc.outputColumns) && proc.outputColumns.length > 0
        ? proc.outputColumns.map(o => ({
            id: o.id || crypto.randomUUID(),
            expression: o.expression || '',
            alias: o.alias || ''
          }))
        : [{ id: crypto.randomUUID(), expression: '', alias: '' }],
      generatedSql: proc.generatedSql || ''
    };

    this.generateStoredProcedure(hydrated);
    return hydrated;
  }

  private normalizeOperator(operator: unknown): DbOperator {
    const value = typeof operator === 'string' ? operator.toUpperCase() : '';
    if (value === '=' || value === '!=' || value === '>' || value === '<' || value === '>=' || value === '<=' || value === 'LIKE') {
      return value;
    }
    return '=';
  }

  private normalizeJoinType(joinType: unknown): DbJoinType {
    const value = typeof joinType === 'string' ? joinType.toUpperCase() : '';
    if (value === 'INNER JOIN' || value === 'LEFT JOIN' || value === 'RIGHT JOIN' || value === 'FULL JOIN') {
      return value;
    }
    return 'INNER JOIN';
  }

  private getAvailableAliases(proc: StoredProcedureConfig): string[] {
    return proc.tables
      .map((t, idx) => (t.alias || `t${idx + 1}`).trim())
      .filter(a => !!a);
  }

  private generateStoredProcedure(proc: StoredProcedureConfig): void {
    const procName = (proc.procedureName || 'sp_GetData').trim();
    const validTables = proc.tables
      .map((t, idx) => ({
        name: (t.name || '').trim(),
        alias: (t.alias || `t${idx + 1}`).trim() || `t${idx + 1}`
      }))
      .filter(t => !!t.name);

    const whereItems = proc.whereClauses
      .map(w => ({
        field: (w.field || '').trim(),
        operator: this.normalizeOperator(w.operator),
        paramName: (w.paramName || '').trim(),
        sampleValue: (w.sampleValue || '').trim()
      }))
      .filter(w => !!w.field && !!w.paramName);

    const firstAlias = validTables[0]?.alias || 't1';

    const validJoinSql = proc.joins
      .map(j => ({
        joinType: this.normalizeJoinType(j.joinType),
        leftAlias: (j.leftTableAlias || '').trim(),
        rightAlias: (j.rightTableAlias || '').trim(),
        onCondition: (j.onCondition || '').trim()
      }))
      .filter(j => !!j.leftAlias && !!j.rightAlias && !!j.onCondition && j.leftAlias !== j.rightAlias)
      .map(j => {
        const rightTable = validTables.find(t => t.alias === j.rightAlias);
        if (!rightTable) {
          return '';
        }
        return `${j.joinType} ${rightTable.name} ${rightTable.alias} ON ${j.onCondition}`;
      })
      .filter(j => !!j);

    const fromSql = validTables.length > 0
      ? `${validTables[0].name} ${validTables[0].alias}${validJoinSql.length > 0 ? `\n    ${validJoinSql.join('\n    ')}` : ''}`
      : 'YourTable t1';

    const outputItems = proc.outputColumns
      .map(o => ({
        expression: (o.expression || '').trim(),
        alias: (o.alias || '').trim()
      }))
      .filter(o => !!o.expression);

    const selectSql = outputItems.length > 0
      ? outputItems.map(o => o.alias ? `${o.expression} AS ${o.alias}` : o.expression).join(',\n        ')
      : `${firstAlias}.*`;

    const paramDefs = whereItems.length > 0
      ? whereItems.map(w => `@${w.paramName} NVARCHAR(255) = NULL`).join(',\n    ')
      : '@Param1 NVARCHAR(255) = NULL';

    const whereSql = whereItems.length > 0
      ? whereItems.map((w, idx) => {
          const prefix = idx === 0 ? 'WHERE' : '  AND';
          return `${prefix} (${w.field} ${w.operator} @${w.paramName} OR @${w.paramName} IS NULL)`;
        }).join('\n')
      : '-- Add where clauses above to generate filters';

    const commentSql = whereItems.length > 0
      ? whereItems.map(w => `-- @${w.paramName}: sample value '${w.sampleValue || 'value'}'`).join('\n')
      : '-- No parameters configured yet';

    const joinCommentSql = validJoinSql.length > 0
      ? ''
      : '\n    -- Define joins above if multiple tables are needed';

    proc.generatedSql = `CREATE OR ALTER PROCEDURE dbo.${procName}\n(\n    ${paramDefs}\n)\nAS\nBEGIN\n    SET NOCOUNT ON;\n\n    ${commentSql}\n\n    SELECT\n        ${selectSql}\n    FROM\n        ${fromSql}${joinCommentSql}\n    ${whereSql}\nEND;`;
  }
}
