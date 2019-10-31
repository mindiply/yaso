import {DBTable} from '../dbModel';
import {IFieldReference, IFieldReferenceFn, ReferencedTable} from './sqlTableFieldReference';
import indentString from 'indent-string';
import {IJoin, join as joinFn, Join, JoinType} from './sqlJoin';
import {BaseSqlExpression, ISQLExpression} from './SQLExpression';
import {countNLines, parenthesizeSql} from './utils';
import {tbl} from "./sqlTableQuery";

export interface IQueryContext {
  addTable: <T>(tbl: ReferencedTable<T>, alias?: string) => string;
}

export class QueryContext implements IQueryContext {
  protected aliases: Map<string, ReferencedTable<any>>;
  protected tables: Map<string, Map<string, ReferencedTable<any>>>;
  protected counter: number;

  constructor() {
    this.aliases = new Map();
    this.tables = new Map();
    this.counter = 1;
  }

  protected addTableRef = <T>(tableRef: ReferencedTable<T>, alias: string) => {
    this.aliases.set(alias, tableRef);
    const dbTblMap = this.tables.get(tableRef.tbl.dbName) || new Map();
    dbTblMap.set(alias, tableRef);
  };

  protected findAvailableAlias<T>(tbl: ReferencedTable<T>): string {
    const tblDbName = tbl.tbl.dbName;
    let alias = tblDbName;
    for (
      ;
      this.aliases.has(alias);
      alias = `${tblDbName}${String(this.counter)}`, this.counter++
    ) {}
    return alias;
  }

  public addTable = <T>(tbl: ReferencedTable<T>, alias?: string): string => {
    if (alias) {
      if (this.aliases.has(alias)) {
        throw new Error('Explicit alias is already user');
      }
    }
    const aliasToUse = alias || this.findAvailableAlias(tbl);
    this.addTableRef(tbl, aliasToUse);
    return aliasToUse;
  };
}

export type ToStringFn = () => string;

type SelectQryTablePrm<T> = DBTable<T> | ReferencedTable<T>;
export interface IQryCallback {
  <T>(qry: SelectQry, t1: T): void;
  <T1, T2>(qry: SelectQry, t1: T1, t2: T2): void;
  <T1, T2, T3>(qry: SelectQry, t1: T1, t2: T2, t3: T3): void;
  <T1, T2, T3, T4>(qry: SelectQry, t1: T1, t2: T2, t3: T3, t4: T4): void;
  <T1, T2, T3, T4, T5>(
    qry: SelectQry,
    t1: T1,
    t2: T2,
    t3: T3,
    t4: T4,
    t5: T5
  ): void;
}

type SelectFields = Array<IFieldReference | ISQLExpression>;
type SelectFieldPrm = IFieldReferenceFn | ISQLExpression;

export class SelectQry extends BaseSqlExpression implements ISQLExpression {
  protected from: ReferencedTable<any>[];
  protected selectFields?: SelectFields;
  protected rootWhere?: ISQLExpression;
  protected joins?: Join;

  constructor(
    tables: SelectQryTablePrm<any> | SelectQryTablePrm<any>[],
    context?: IQueryContext
  ) {
    super();
    if (!tables) {
      throw new Error('Expected at least one table');
    }
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      table instanceof DBTable ? tbl(table) : table
    );
    if (context) {
      this.queryContext = context;
    }
  }

  public executeCallback = (cb: IQryCallback): void =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    cb(this, ...this.from);

  public fields = (fields: SelectFieldPrm | SelectFieldPrm[]): SelectQry => {
    const flds = Array.isArray(fields) ? fields : [fields];
    this.selectFields = flds.map(fld =>
      typeof fld === 'function'
        ? (fld() as IFieldReference)
        : (fld as ISQLExpression)
    );
    this.selectFields.forEach(
      field => (field.queryContext = this.queryContext)
    );
    return this;
  };

  public join = (
    p1: IFieldReferenceFn | IJoin<any, any>,
    p2: IFieldReferenceFn | IJoin<any, any>,
    p3: JoinType | IFieldReferenceFn | IJoin<any, any> = JoinType.inner,
    p4?: JoinType | IFieldReferenceFn,
    p5?: JoinType
  ): SelectQry => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    this.joins = joinFn(p1, p2!, p3!, p4, p5);
    return this;
  };

  public where = (rootCond: ISQLExpression) => {
    this.rootWhere = rootCond;
    this.rootWhere.queryContext = this.queryContext;
  };

  public toSelectAllSql = () => {
    const fields = Object.values(this.from)
      .map(selectTable =>
        selectTable.tbl.fields.map(field =>
          (selectTable[
            field.name as string
          ] as IFieldReferenceFn)().toSelectSql()
        )
      )
      .reduce((allFields, newFields) => allFields.concat(newFields), []);
    return fields.join(',\n');
  };

  public toString = (nSpaces = 0): string => {
    const fieldsSql = this.selectFields
      ? this.selectFields
          .map(selectField => {
            return (selectField as IFieldReference).toSelectSql
              ? (selectField as IFieldReference).toSelectSql()
              : selectField.isSimpleValue()
              ? selectField.toSql()
              : parenthesizeSql(selectField.toSql());
          })
          .join(',\n')
      : this.toSelectAllSql();
    const whereSql = this.rootWhere ? this.rootWhere.toSql() : undefined;
    return indentString(
      `select${countNLines(fieldsSql) > 1 ? '\n' : ''}${indentString(
        fieldsSql,
        countNLines(fieldsSql) > 1 ? 2 : 1
      )}
from${this.fromSql()}${
        whereSql
          ? `
where${countNLines(whereSql) > 1 ? '\n' : ''}${indentString(
              whereSql,
              countNLines(whereSql) > 1 ? 2 : 1
            )}`
          : ''
      }`,
      nSpaces
    );
  };

  protected fromSql = (): string => {
    if (this.joins) {
      return this.joins.toSql();
    }
    const tables = Object.values(this.from);
    if (tables.length === 1) {
      return ` ${tables[0].toSql()}`;
    }
    return (
      '\n' +
      Object.values(this.from)
        .map(qryTbl => indentString(qryTbl.toSql(), 2))
        .join(',\n')
    );
  };

  public toSql = () => this.toString();

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.propagateContext();
  }

  protected propagateContext = () => {
    this.selectFields &&
      this.selectFields.forEach(
        field => (field.queryContext = this.queryContext)
      );
    if (this.rootWhere) {
      this.rootWhere.queryContext = this.queryContext;
    }
  };
}

export function selectFrom<T>(
  from: SelectQryTablePrm<T>,
  cb?: (qry: SelectQry, t1: ReferencedTable<T>) => void
): SelectQry;
export function selectFrom<T>(
  from: [SelectQryTablePrm<T>],
  cb?: (qry: SelectQry, t1: ReferencedTable<T>) => void
): SelectQry;
export function selectFrom<T1, T2>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>],
  cb?: (
    qry: SelectQry,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>
  ) => void
): SelectQry;
export function selectFrom(
  from: SelectQryTablePrm<any> | SelectQryTablePrm<any>[],
  cb?: (qry: SelectQry, ...tables: any[]) => void
): SelectQry {
  const qry = new SelectQry(from);
  if (cb) {
    qry.executeCallback(cb);
  }
  return qry;
}
