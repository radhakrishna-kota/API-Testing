import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

interface AnalyzedTable {
  name: string;
  alias: string;
}

interface AnalyzedJoin {
  joinType: string;
  table: string;
  alias: string;
  onCondition: string;
}

interface AnalyzedParam {
  paramName: string;
  dataType: string;
  defaultValue: string;
}

interface AnalyzedWhereClause {
  field: string;
  operator: string;
  paramOrValue: string;
}

interface SPAnalysis {
  procedureName: string;
  tables: AnalyzedTable[];
  joins: AnalyzedJoin[];
  params: AnalyzedParam[];
  whereClauses: AnalyzedWhereClause[];
  selectColumns: string[];
  suggestions: string[];
  optimizedSql: string;
}

@Component({
  selector: 'app-analyze-sp',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analyze-sp.component.html',
  styleUrls: ['./analyze-sp.component.css']
})
export class AnalyzeSPComponent {
  currentUser: string | null = null;
  spInput: string = '';
  analysis: SPAnalysis | null = null;
  analysisError: string = '';

  constructor(private authService: AuthService, private router: Router) {
    this.currentUser = this.authService.getCurrentUser();
  }

  backToHome(): void {
    this.router.navigate(['/home']);
  }

  goToSpGenerator(): void {
    this.router.navigate(['/db-stored-procedure']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  clearAll(): void {
    this.spInput = '';
    this.analysis = null;
    this.analysisError = '';
  }

  analyzeSP(): void {
    this.analysisError = '';
    this.analysis = null;
    const sql = this.spInput.trim();
    if (!sql) {
      this.analysisError = 'Please paste a stored procedure to analyze.';
      return;
    }
    try {
      this.analysis = this.parseStoredProcedure(sql);
    } catch (e) {
      this.analysisError = 'Could not fully parse the procedure. Partial results may be shown.';
    }
  }

  private parseStoredProcedure(sql: string): SPAnalysis {
    const lines = sql.split('\n');
    const upperSql = sql.toUpperCase();

    // Procedure name
    const procNameMatch = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+(\[?[\w.]+\]?)/i);
    const procedureName = procNameMatch ? procNameMatch[1].replace(/[\[\]]/g, '') : 'Unknown';

    // Parameters
    const params: AnalyzedParam[] = [];
    const paramBlockMatch = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+[\w.\[\]]+\s*\(([\s\S]*?)\)\s*(?:AS|BEGIN)/i);
    if (paramBlockMatch) {
      const paramBlock = paramBlockMatch[1];
      const paramLines = paramBlock.split(',');
      for (const pl of paramLines) {
        const pm = pl.trim().match(/^(@[\w]+)\s+([\w()[\], ]+?)(?:\s*=\s*(.+))?$/i);
        if (pm) {
          params.push({
            paramName: pm[1],
            dataType: pm[2].trim(),
            defaultValue: pm[3] ? pm[3].trim() : ''
          });
        }
      }
    }

    // Tables (FROM and JOIN)
    const tables: AnalyzedTable[] = [];
    const tableMap = new Map<string, string>();

    const fromMatch = sql.match(/\bFROM\s+([\w.\[\]]+)(?:\s+(?:AS\s+)?([\w]+))?/gi);
    if (fromMatch) {
      for (const fm of fromMatch) {
        const m = fm.match(/\bFROM\s+([\w.\[\]]+)(?:\s+(?:AS\s+)?([\w]+))?/i);
        if (m) {
          const tName = m[1].replace(/[\[\]]/g, '');
          const alias = m[2] || tName.split('.').pop() || tName;
          if (!tableMap.has(tName.toLowerCase())) {
            tableMap.set(tName.toLowerCase(), alias);
            tables.push({ name: tName, alias });
          }
        }
      }
    }

    // Joins
    const joins: AnalyzedJoin[] = [];
    const joinRegex = /\b(INNER JOIN|LEFT(?:\s+OUTER)?\s+JOIN|RIGHT(?:\s+OUTER)?\s+JOIN|FULL(?:\s+OUTER)?\s+JOIN|CROSS JOIN)\s+([\w.\[\]]+)(?:\s+(?:AS\s+)?([\w]+))?\s+ON\s+([^\n\r]+)/gi;
    let jMatch: RegExpExecArray | null;
    while ((jMatch = joinRegex.exec(sql)) !== null) {
      const tName = jMatch[2].replace(/[\[\]]/g, '');
      const alias = jMatch[3] || tName.split('.').pop() || tName;
      if (!tableMap.has(tName.toLowerCase())) {
        tableMap.set(tName.toLowerCase(), alias);
        tables.push({ name: tName, alias });
      }
      joins.push({
        joinType: jMatch[1].replace(/\s+/g, ' ').toUpperCase(),
        table: tName,
        alias,
        onCondition: jMatch[4].trim()
      });
    }

    // WHERE clauses
    const whereClauses: AnalyzedWhereClause[] = [];
    const whereBlockMatch = sql.match(/\bWHERE\b([\s\S]+?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bFOR\b|$)/i);
    if (whereBlockMatch) {
      const whereBlock = whereBlockMatch[1];
      const conditionRegex = /([\w.]+)\s*(=|!=|<>|>=|<=|>|<|LIKE|IN|NOT\s+IN|IS\s+NULL|IS\s+NOT\s+NULL)\s*(@?[\w'%()]+|NULL)/gi;
      let cm: RegExpExecArray | null;
      while ((cm = conditionRegex.exec(whereBlock)) !== null) {
        whereClauses.push({
          field: cm[1],
          operator: cm[2].replace(/\s+/g, ' ').toUpperCase(),
          paramOrValue: cm[3]
        });
      }
    }

    // SELECT columns
    const selectColumns: string[] = [];
    const selectMatch = sql.match(/\bSELECT\b([\s\S]+?)\bFROM\b/i);
    if (selectMatch) {
      const cols = selectMatch[1];
      if (cols.trim() === '*') {
        selectColumns.push('* (all columns)');
      } else {
        cols.split(',').forEach(c => {
          const cleaned = c.trim().replace(/\s+/g, ' ');
          if (cleaned) selectColumns.push(cleaned);
        });
      }
    }

    // Suggestions
    const suggestions = this.generateSuggestions(sql, tables, joins, whereClauses, selectColumns, params);

    // Optimized SQL
    const optimizedSql = this.generateOptimizedSQL(procedureName, params, tables, joins, whereClauses, selectColumns);

    return { procedureName, tables, joins, params, whereClauses, selectColumns, suggestions, optimizedSql };
  }

  private generateSuggestions(
    sql: string,
    tables: AnalyzedTable[],
    joins: AnalyzedJoin[],
    whereClauses: AnalyzedWhereClause[],
    selectColumns: string[],
    params: AnalyzedParam[]
  ): string[] {
    const suggestions: string[] = [];

    if (selectColumns.some(c => c.includes('*'))) {
      suggestions.push('⚠️ Avoid SELECT * — explicitly list required columns to improve performance and maintainability.');
    }

    if (tables.length > 1 && joins.length === 0) {
      suggestions.push('⚠️ Multiple tables detected without explicit JOINs — consider using explicit JOIN syntax instead of implicit cross joins in WHERE.');
    }

    if (joins.some(j => j.joinType.includes('CROSS JOIN'))) {
      suggestions.push('⚠️ CROSS JOIN detected — verify this is intentional as it produces a Cartesian product.');
    }

    if (whereClauses.length === 0) {
      suggestions.push('⚠️ No WHERE clause found — consider adding filters to restrict result sets and improve performance.');
    }

    if (whereClauses.some(w => w.operator === 'LIKE' && !w.paramOrValue.startsWith('%'))) {
      suggestions.push('💡 LIKE with a leading wildcard (e.g. LIKE \'%value\') prevents index use. Consider full-text search or restructuring the query.');
    }

    const hasNolock = /NOLOCK|WITH\s*\(\s*NOLOCK\s*\)/i.test(sql);
    if (!hasNolock && tables.length > 0) {
      suggestions.push('💡 Consider adding WITH (NOLOCK) hints for read-only queries to reduce lock contention (if dirty reads are acceptable).');
    }

    if (!/SET\s+NOCOUNT\s+ON/i.test(sql)) {
      suggestions.push('💡 Add SET NOCOUNT ON at the beginning to suppress row-count messages and improve performance.');
    }

    if (params.some(p => p.dataType.toUpperCase().includes('NVARCHAR') && !p.dataType.includes('('))) {
      suggestions.push('⚠️ NVARCHAR parameter without explicit length detected — specify a length (e.g. NVARCHAR(100)) to avoid defaulting to NVARCHAR(1).');
    }

    if (tables.length === 0) {
      suggestions.push('ℹ️ No tables detected — ensure the procedure contains a valid SELECT ... FROM statement.');
    }

    if (suggestions.length === 0) {
      suggestions.push('✅ No obvious issues found. The procedure looks well-structured.');
    }

    return suggestions;
  }

  private generateOptimizedSQL(
    procName: string,
    params: AnalyzedParam[],
    tables: AnalyzedTable[],
    joins: AnalyzedJoin[],
    whereClauses: AnalyzedWhereClause[],
    selectColumns: string[]
  ): string {
    const lines: string[] = [];
    lines.push(`CREATE PROCEDURE ${procName}`);

    if (params.length > 0) {
      const paramLines = params.map((p, i) => {
        const comma = i < params.length - 1 ? ',' : '';
        return `    ${p.paramName} ${p.dataType}${p.defaultValue ? ' = ' + p.defaultValue : ''}${comma}`;
      });
      lines.push('(');
      lines.push(...paramLines);
      lines.push(')');
    }

    lines.push('AS');
    lines.push('BEGIN');
    lines.push('    SET NOCOUNT ON;');
    lines.push('');

    const cols = selectColumns.length > 0 && !selectColumns.some(c => c.includes('*'))
      ? selectColumns.map(c => `        ${c}`).join(',\n')
      : '        *  -- TODO: replace * with explicit columns';

    if (tables.length > 0) {
      lines.push(`    SELECT`);
      lines.push(cols);
      lines.push(`    FROM ${tables[0].name} ${tables[0].alias} WITH (NOLOCK)`);

      for (const j of joins) {
        lines.push(`    ${j.joinType} ${j.table} ${j.alias} WITH (NOLOCK)`);
        lines.push(`        ON ${j.onCondition}`);
      }

      if (whereClauses.length > 0) {
        lines.push(`    WHERE`);
        whereClauses.forEach((w, idx) => {
          const prefix = idx === 0 ? '        ' : '        AND ';
          lines.push(`${prefix}${w.field} ${w.operator} ${w.paramOrValue}`);
        });
      }
      lines.push('    ;');
    } else {
      lines.push('    -- TODO: Add your SELECT statement here');
    }

    lines.push('END');
    lines.push('GO');

    return lines.join('\n');
  }

  copyOptimized(): void {
    if (this.analysis?.optimizedSql) {
      navigator.clipboard.writeText(this.analysis.optimizedSql);
    }
  }
}
