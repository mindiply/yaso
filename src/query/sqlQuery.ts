import { DBField, DBTable } from "../dbModel";
import {
  FieldReference,
  IFieldReference,
  IFieldReferenceFn
} from "./sqlFieldReference";
import indentString from "indent-string";
import { IJoin, join as joinFn, Join, JoinType } from "./sqlJoin";
import {IBaseWhereCond, IWhere} from './sqlWhere'

let FieldReferenceClass: typeof FieldReference = FieldReference;
export function setFieldReferenceClass(fieldRefClass: typeof FieldReference) {
  FieldReferenceClass = fieldRefClass;
}

const createFieldReferenceFn = <T>(
  qryTbl: ReferencedSelectTable<T>,
  field: DBField,
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

type ToStringFn = () => string;

type ReferencedTableFields<T> = {
  [P in keyof T]: IFieldReferenceFn<T[P]>;
};

class SelectTable<T = any> {
  [fieldname: string]:
    | IFieldReferenceFn
    | DBTable
    | string
    | ToStringFn
    | undefined;
  public readonly tbl: DBTable<T>;
  public readonly alias?: string;

  constructor(tbl: DBTable<T>, alias?: string) {
    this.tbl = tbl;
    if (alias) {
      this.alias = alias;
    }
    this.tbl.fields.forEach(field => {
      this[field.name] = createFieldReferenceFn(
        this as ReferencedSelectTable<T>,
        field
      );
    });
  }

  public toSql = (): string =>
    `${this.tbl.dbName}${this.alias ? ` as "${this.alias}"` : ""}`;

  public toReferenceSql = (): string => this.alias || this.tbl.dbName;
}

interface ISelectTable<T> extends SelectTable<T> {}

export type ReferencedSelectTable<T> = ISelectTable<T> &
  {
    [P in keyof T]: IFieldReferenceFn<T[P]>;
  };

export function createSelectTable<T>(
  dbTable: DBTable<T>,
  alias?: string
): ReferencedSelectTable<T> {
  const tbl = new SelectTable(dbTable, alias);
  return tbl as ReferencedSelectTable<T>;
}

type SelectQryTablePrm<T> = DBTable<T> | ReferencedSelectTable<T>;
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
  protected from: ReferencedSelectTable<any>[];
  protected selectFields?: IFieldReference[];
  protected rootWhere?: IBaseWhereCond;
  protected joins?: Join;

  constructor(tables: SelectQryTablePrm<any> | SelectQryTablePrm<any>[]) {
    if (!tables) {
      throw new Error("Expected at least one table");
    }
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      table instanceof SelectTable ? table : createSelectTable(table)
    );

    const aliases: Set<string> = new Set();
    this.from.forEach(tbl => {
      if (aliases.has(tbl.toReferenceSql())) {
        throw new Error("Alias already in query");
      }
      aliases.add(tbl.toReferenceSql());
    });
  }

  public executeCallback = (cb: IQryCallback): void =>
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
    // @ts-ignore
    this.joins = joinFn(p1, p2!, p3!, p4, p5);
    return this;
  };

  public where = (rootCond: IWhere) => {
    this.rootWhere = rootCond;
  }

  public toSelectAllSql = (nSpaces = 0) => {
    const fields = Object.values(this.from)
      .map(selectTable =>
        selectTable.tbl.fields.map(field =>
          indentString(
            (selectTable[field.name] as IFieldReferenceFn)().toSelectSql(),
            nSpaces + 2
          )
        )
      )
      .reduce((allFields, newFields) => allFields.concat(newFields), []);
    return fields.join(",\n");
  };

  public toString = (nSpaces = 0): string => {
    return indentString(
      `select
${
  this.selectFields
    ? this.selectFields
        .map(selectField =>
          indentString(selectField.toSelectSql(), nSpaces + 2)
        )
        .join(",\n")
    : this.toSelectAllSql()
}
from${this.fromSql(nSpaces)}${this.rootWhere ? `
where
${indentString(this.rootWhere.toSql(), nSpaces + 2)}` : ''}`,
      nSpaces
    );
  };

  protected fromSql = (nSpaces = 0): string => {
    if (this.joins) {
      return this.joins.toSql(nSpaces + 2);
    }
    const tables = Object.values(this.from);
    if (tables.length === 1) {
      return ` ${tables[0].toSql()}`;
    }
    return (
      "\n" +
      Object.values(this.from)
        .map(qryTbl => indentString(qryTbl.toSql(), nSpaces + 2))
        .join(",\n")
    );
  };


}

export function selectFrom<T>(
  from: SelectQryTablePrm<T>,
  cb?: (qry: SelectQry, t1: ReferencedSelectTable<T>) => void
): SelectQry;
export function selectFrom<T>(
  from: [SelectQryTablePrm<T>],
  cb?: (qry: SelectQry, t1: ReferencedSelectTable<T>) => void
): SelectQry;
export function selectFrom<T1, T2>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>],
  cb?: (
    qry: SelectQry,
    t1: ReferencedSelectTable<T1>,
    t2: ReferencedSelectTable<T2>
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

