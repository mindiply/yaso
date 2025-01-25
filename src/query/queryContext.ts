import {IQueryContext, ResultSet} from '../dbTypes';

export class QueryContext implements IQueryContext {
  // Map of aliases to quickly check if we are adding duplicate aliases
  private aliases: Set<string>;

  // Quick lookup of the alias assigned to each table in the query context
  private tables: Map<ResultSet<any>, string>;

  // Counter per tableName to allow automatically adding a number after
  // the tablename when an alias is not provided
  private counters: Map<string, number>;

  constructor() {
    this.aliases = new Set();
    this.tables = new Map();
    this.counters = new Map();
  }

  private addTableAndAlias = (
    tableRef: ResultSet<any>,
    tblName: string,
    alias: string
  ) => {
    this.aliases.add(alias);
    this.tables.set(tableRef, alias);
  };

  private nextCounterBasedAlias(tblName: string): string {
    let alias = '';
    for (let i = this.counters.get(tblName) || 0; alias === ''; i++) {
      const ithAlias = i > 0 ? `${tblName}${i + 1}` : tblName;
      if (!this.aliases.has(ithAlias)) {
        this.counters.set(tblName, i + 1);
        alias = ithAlias;
      }
    }
    return alias;
  }

  public addTable = (tbl: ResultSet<any>, alias?: string): string => {
    const tblName = tbl.name;
    const aliasProvided = alias ? alias : tbl.alias;
    if (alias || tbl.isExplicitAlias) {
      if (this.aliases.has(aliasProvided)) {
        throw new Error('Explicit alias is already used');
      }
      this.addTableAndAlias(tbl, tblName, aliasProvided);
      return aliasProvided;
    }
    const tblAlias = this.nextCounterBasedAlias(tblName);
    this.addTableAndAlias(tbl, tblName, tblAlias);
    return tblAlias;
  };

  public tableRefAlias = (tblRef: ResultSet<any>): null | string => {
    return this.tables.get(tblRef) || null;
  };
}
