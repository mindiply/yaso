import {DBField, DBTable} from '../dbModel';
import {
  FieldReference,
  IFieldReference,
  IFieldReferenceFn
} from './sqlFieldReference';
import indentString from 'indent-string';
import {IJoin, join as joinFn, Join, JoinType} from './sqlJoin';
import {ReferencedTable, tbl} from './sqlTableQuery';
import {ISQLExpression} from './SQLExpression';
import {countNLines} from './utils';

let FieldReferenceClass: typeof FieldReference = FieldReference;
export function setFieldReferenceClass(fieldRefClass: typeof FieldReference) {
  FieldReferenceClass = fieldRefClass;
}

export const createFieldReferenceFn = <T>(
  qryTbl: ReferencedTable<T>,
  field: DBField<T>,
  alias?: string
): IFieldReferenceFn<T> => {
  const ref: IFieldReference<T> = new FieldReferenceClass(qryTbl, field);
  if (alias) {
    ref.alias = alias;
  }
  return (newAlias?: string): IFieldReference => {
    if (newAlias) {
      ref.alias = newAlias;
    }
    return ref;
  };
};

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

export class SelectQry {
  protected from: ReferencedTable<any>[];
  protected selectFields?: IFieldReference[];
  protected rootWhere?: ISQLExpression;
  protected joins?: Join;

  constructor(tables: SelectQryTablePrm<any> | SelectQryTablePrm<any>[]) {
    if (!tables) {
      throw new Error('Expected at least one table');
    }
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      table instanceof DBTable ? tbl(table) : table
    );

    const aliases: Set<string> = new Set();
    this.from.forEach(tbl => {
      if (aliases.has(tbl.toReferenceSql())) {
        throw new Error('Alias already in query');
      }
      aliases.add(tbl.toReferenceSql());
    });
  }

  public executeCallback = (cb: IQryCallback): void =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    cb(this, ...this.from);

  public fields = (
    fields: IFieldReferenceFn | IFieldReferenceFn[]
  ): SelectQry => {
    const flds = Array.isArray(fields) ? fields : [fields];
    this.selectFields = flds.map(fld => fld());
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
          .map(selectField => selectField.toSelectSql())
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
