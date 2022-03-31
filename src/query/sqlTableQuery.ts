import indentString from 'indent-string';
import {
  BaseReferenceTable,
  createReferencedTable,
  isReferencedTable
} from './sqlTableFieldReference';
import {createDBTbl, isDBTable} from '../dbModel';
import {countNLines} from './utils';
import {transformFieldUpdatesToSql} from './SQLExpression';
import {
  IDBTable,
  IQueryContext,
  SQLExpression,
  TableDefinition,
  ReferencedTable,
  SQLAliasedExpression,
  TableFieldReference
} from '../dbTypes';
import {TableFieldUpdates, ISQLOrderByField, SelectQuery} from './types';
import {deleteClause, selectFrom, whereClause} from './sqlQuery';
import {Statement} from './statements';
import {QueryContext} from './queryContext';

export type SelectFieldRef<T> = keyof T | SQLExpression | ReferencedTable<T>;

interface ITableQryBaseParameters<T> {
  tbl: ReferencedTable<T>;
}

interface ITableSelectQryParameters<T> {
  fields?: SelectFieldRef<T>[];
  where?: SQLExpression;
  orderByFields?: ISQLOrderByField<T>[];
  maxRows?: number;
}

export interface IInsertQryParameters<T> {
  fields: TableFieldUpdates<T>;
  returnFields?: boolean | Array<keyof T>;
}

export interface IUpdateQryParameters<T> extends IInsertQryParameters<T> {
  where: SQLExpression;
}

export interface IDeleteQryParameters {
  where?: SQLExpression;
}

abstract class BaseTableQuery<T> {
  protected refTbl: ReferencedTable<T>;

  protected constructor(tbl: ReferencedTable<T>) {
    this.refTbl = tbl;
  }

  protected fieldsTableSelect = (
    qryContext: IQueryContext = new QueryContext(),
    fieldRefs: SelectFieldRef<T>[] | undefined
  ): string => {
    const fieldsToSelect: Array<SQLAliasedExpression> = [];
    if (fieldRefs) {
      for (const fieldRef of fieldRefs) {
        if (isReferencedTable(fieldRef)) {
          fieldsToSelect.push(
            ...Array.from(fieldRef.fields.values()).map(ref =>
              ref.toSelectSql()
            )
          );
        } else if (typeof fieldRef === 'string') {
          fieldsToSelect.push(
            this.refTbl.cols[fieldRef as keyof T]().toSelectSql()
          );
        } else {
          fieldsToSelect.push(fieldRef as SQLAliasedExpression);
        }
      }
    } else {
      for (const colName in this.refTbl.cols) {
        fieldsToSelect.push(this.refTbl.cols[colName]().toSelectSql());
      }
    }
    fieldsToSelect.sort((a, b) => {
      const aAlias = a.alias;
      const bAlias = b.alias;
      if ((aAlias || '') < (bAlias || '')) {
        return -1;
      }
      if ((aAlias || '') == (bAlias || '')) {
        return 0;
      }
      return 1;
    });
    const fieldsSql = fieldsToSelect
      .map(field => field.toSql(qryContext))
      .join(',\n');
    return fieldsSql;
  };

  public isSimpleValue = () => false;
}

type IGenerateParametersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => ITableSelectQryParameters<T>;

interface ITableSelectQrySql {
  <T>(dbTable: IDBTable<T>, props: ITableSelectQryParameters<T>): string;
  <T>(dbTable: IDBTable<T>, cb: IGenerateParametersCallbackFn<T>): string;
  <T>(dbTable: ReferencedTable<T>, props: ITableSelectQryParameters<T>): string;
  <T>(
    dbTable: ReferencedTable<T>,
    cb: IGenerateParametersCallbackFn<T>
  ): string;
}

const tableSelectQry = <T>(
  dbTable: IDBTable<T> | ReferencedTable<T>,
  propsOrCb:
    | ITableSelectQryParameters<T>
    | IGenerateParametersCallbackFn<T> = {}
): SelectQuery => {
  const refTbl: ReferencedTable<T> = isDBTable<T>(dbTable)
    ? createReferencedTable(dbTable)
    : (dbTable as ReferencedTable<T>);
  const props = typeof propsOrCb === 'function' ? propsOrCb(refTbl) : propsOrCb;
  const tblQuery = selectFrom(refTbl);
  if (props.maxRows && props.maxRows > 0) {
    tblQuery.maxRows(props.maxRows);
  }
  if (props.fields) {
    tblQuery.fields(
      props.fields.map(fieldRef => {
        if (typeof fieldRef === 'string') {
          return refTbl.cols[fieldRef as keyof T];
        }
        return fieldRef as SQLAliasedExpression | ReferencedTable<T>;
      })
    );
  }
  if (props.orderByFields) {
    tblQuery.orderBy(props.orderByFields as ISQLOrderByField<any>[]);
  }
  if (props.where) {
    tblQuery.where(props.where);
  }
  return tblQuery;
};

export const tableSelectSql: ITableSelectQrySql = <T>(
  dbTable: IDBTable<T> | ReferencedTable<T>,
  propsOrCb:
    | ITableSelectQryParameters<T>
    | IGenerateParametersCallbackFn<T> = {}
): string => {
  const tblQuery = tableSelectQry(dbTable, propsOrCb);
  return tblQuery.toSql();
};

class BaseWriteTableQuery<T> extends BaseTableQuery<T> {
  protected fieldsChanges: TableFieldUpdates<T>;
  protected returnFields?: boolean | Array<keyof T>;

  constructor({
    tbl,
    fields,
    returnFields
  }: IInsertQryParameters<T> & ITableQryBaseParameters<T>) {
    super(tbl);
    this.fieldsChanges = fields;
    this.returnFields = returnFields;
  }

  protected addUpdateFieldsIfNeeded = (isInsert = false) => {
    const addedChanges: TableFieldUpdates<T> = {};
    const tblDef = this.refTbl.tbl;
    if (
      tblDef.hasCC &&
      tblDef.ccField &&
      !(tblDef.ccField.name in this.fieldsChanges)
    ) {
      addedChanges[tblDef.ccField.name as keyof T] = undefined;
    }
    if (
      tblDef.hasUpdateTimestamp &&
      tblDef.updateTimestampField &&
      !(tblDef.updateTimestampField.name in this.fieldsChanges)
    ) {
      addedChanges[tblDef.updateTimestampField.name as keyof T] = undefined;
    }
    if (
      isInsert &&
      tblDef.hasInsertTimestamp &&
      tblDef.insertTimestampField &&
      !(tblDef.insertTimestampField.name in this.fieldsChanges)
    ) {
      addedChanges[tblDef.insertTimestampField.name as keyof T] = undefined;
    }
    if (Object.keys(addedChanges).length > 0) {
      this.fieldsChanges = {...this.fieldsChanges, ...addedChanges};
    }
  };

  protected returningFieldsSql = (
    qryContext: IQueryContext,
    fieldNames: Array<keyof T> | undefined
  ): string => {
    const returnSql = this.fieldsTableSelect(qryContext, fieldNames);
    const nReturnLines = countNLines(returnSql);
    if (nReturnLines > 0) {
      return `\nreturning${
        nReturnLines > 1 ? '\n' + indentString(returnSql, 2) : ' ' + returnSql
      }`;
    } else {
      return '';
    }
  };

  protected mapUpdateEntryToSql = (
    qryContext: IQueryContext,
    [fieldName, fieldValue]: [string, SQLExpression]
  ): string => {
    if (!(fieldName in this.refTbl.cols)) {
      throw new TypeError(`Field ${fieldName} not mapped`);
    }
    const field = this.refTbl.cols[
      fieldName as keyof T
    ]() as unknown as TableFieldReference<T>;
    return field.toUpdateFieldSql(fieldValue).toSql(qryContext);
  };
}

class InsertTableQuery<T>
  extends BaseWriteTableQuery<T>
  implements SQLExpression
{
  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    qryContext.addTable(this.refTbl);
    this.addUpdateFieldsIfNeeded(true);
    const changeFields: Array<[string, SQLExpression]> = Object.entries(
      transformFieldUpdatesToSql(this.fieldsChanges)
    );
    changeFields.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] === b[0]) return 0;
      return 1;
    });
    const fldList: string[] = [];
    const valList: string[] = [];
    changeFields.forEach(([fieldName, fieldValue]) => {
      if (!(fieldName in this.refTbl.cols)) {
        throw new TypeError(`Field ${fieldName} not mapped`);
      }
      const fieldRef = this.refTbl.cols[
        fieldName as keyof T
      ]() as unknown as TableFieldReference<T>;
      fldList.push(fieldRef.field.dbName);
      valList.push(
        fieldRef.writeValueToSQL(fieldValue, true).toSql(qryContext)
      );
    });

    const fieldList = fldList.join(',\n');
    const valueList = valList.join(',\n');
    let sql = `insert into ${this.refTbl.tbl.dbName} (${
      changeFields.length > 1 ? '\n' : ''
    }${changeFields.length > 1 ? indentString(fieldList, 2) : fieldList}${
      changeFields.length > 1 ? '\n' : ''
    }) values (${changeFields.length > 1 ? '\n' : ''}${
      changeFields.length > 1 ? indentString(valueList, 2) : valueList
    }${changeFields.length > 1 ? '\n' : ''})`;
    if (this.returnFields) {
      sql += this.returningFieldsSql(
        qryContext,
        Array.isArray(this.returnFields) ? this.returnFields : undefined
      );
    }
    return sql;
  };
}

type IGenerateInsertParametersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => IInsertQryParameters<T>;

interface ITableInsertQrySql {
  <T>(dbTable: IDBTable<T>, prms: IInsertQryParameters<T>): string;
  <T>(dbTable: IDBTable<T>, cb: IGenerateInsertParametersCallbackFn<T>): string;
}
export const insertQuerySql: ITableInsertQrySql = <T>(
  dbTable: IDBTable<T>,
  prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
): string => {
  const tblRef = createReferencedTable(dbTable);
  const changes: IInsertQryParameters<T> =
    typeof prmsOrCb === 'object' ? prmsOrCb : prmsOrCb(tblRef);
  const tblQuery = new InsertTableQuery({
    tbl: tblRef,
    ...changes
  });
  return tblQuery.toSql();
};

class UpdateTableQuery<T>
  extends BaseWriteTableQuery<T>
  implements SQLExpression
{
  protected where: SQLExpression;

  constructor({
    where,
    ...other
  }: IUpdateQryParameters<T> & ITableQryBaseParameters<T>) {
    super(other);
    this.where = where;
  }

  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    this.addUpdateFieldsIfNeeded();
    const changeFields: Array<[string, SQLExpression]> = Object.entries(
      transformFieldUpdatesToSql(this.fieldsChanges)
    );
    changeFields.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] === b[0]) return 0;
      return 1;
    });
    const whereSql = this.where.toSql(qryContext);
    const nLinesWhere = countNLines(whereSql);
    let sql = `update ${this.refTbl.tbl.dbName}
set${changeFields.length > 1 ? '\n' : ''}${indentString(
      changeFields
        .map(([fieldName, fieldValue]) =>
          this.mapUpdateEntryToSql(qryContext, [fieldName, fieldValue])
        )
        .join(',\n'),
      changeFields.length > 1 ? 2 : 1
    )}
where${nLinesWhere > 1 ? '\n' : ''}${indentString(
      this.where.toSql(qryContext),
      nLinesWhere > 1 ? 2 : 1
    )}`;
    if (this.returnFields) {
      sql += this.returningFieldsSql(
        qryContext,
        Array.isArray(this.returnFields) ? this.returnFields : undefined
      );
    }
    return sql;
  };
}

type IGenerateUpdateParametersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => IUpdateQryParameters<T>;

type IGenerateDeleteParametersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => IDeleteQryParameters;

interface ITableDeleteQry<Result> {
  <T>(
    dbTable: IDBTable<T> | ReferencedTable<T>,
    qryPrms?: IDeleteQryParameters
  ): Result;
  <T>(
    dbTable: IDBTable<T> | ReferencedTable<T>,
    cb?: IGenerateDeleteParametersCallbackFn<T>
  ): Result;
}

export const deleteQuery: ITableDeleteQry<SQLExpression> = <T>(
  dbTable: IDBTable<T> | ReferencedTable<T>,
  prmsOrCb: IDeleteQryParameters | IGenerateDeleteParametersCallbackFn<T> = {}
): SQLExpression => {
  const statement = new Statement();
  const baseTbl = isReferencedTable(dbTable)
    ? (dbTable as ReferencedTable<T>)
    : tbl(dbTable as IDBTable<T>);
  const deletePrms =
    typeof prmsOrCb === 'function' ? prmsOrCb(baseTbl) : prmsOrCb;
  statement.addClause('deleteClause', deleteClause(baseTbl));
  const {where} = deletePrms;
  if (where) {
    statement.addClause('where', whereClause(where));
  }
  return statement;
};

export const deleteQuerySql: ITableDeleteQry<string> = <T>(
  dbTable: IDBTable<T> | ReferencedTable<T>,
  prmsOrCb: IDeleteQryParameters | IGenerateDeleteParametersCallbackFn<T> = {}
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-expect-error
): string => deleteQuery(dbTable, prmsOrCb).toSql();

interface ITableUpdateQrySql {
  <T>(dbTable: IDBTable<T>, qryPrms: IUpdateQryParameters<T>): string;
  <T>(dbTable: IDBTable<T>, cb: IGenerateUpdateParametersCallbackFn<T>): string;
}
export const updateQuerySql: ITableUpdateQrySql = <T>(
  dbTable: IDBTable<T>,
  prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
): string => {
  const tblRef = createReferencedTable(dbTable);
  const changes: IUpdateQryParameters<T> =
    typeof prmsOrCb === 'object' ? prmsOrCb : prmsOrCb(tblRef);
  const tblQuery = new UpdateTableQuery({
    tbl: tblRef,
    ...changes
  });
  return tblQuery.toSql();
};

interface RefTableQueries<T> {
  insertQry: (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ) => SQLExpression;
  insertQrySql: (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ) => string;
  updateQry: (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ) => SQLExpression;
  updateQrySql: (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ) => string;
  selectQry: (
    propsOrCb: ITableSelectQryParameters<T> | IGenerateParametersCallbackFn<T>
  ) => SelectQuery;
  selectQrySql: (
    propsOrCb: ITableSelectQryParameters<T> | IGenerateParametersCallbackFn<T>
  ) => string;
  deleteQry: (
    propsOrCb?: IDeleteQryParameters | IGenerateDeleteParametersCallbackFn<T>
  ) => SQLExpression;
  deleteQrySql: (
    propsOrCb?: IDeleteQryParameters | IGenerateDeleteParametersCallbackFn<T>
  ) => string;
}

type QueryReferenceTable<T> = ReferencedTable<T> & RefTableQueries<T>;

class QueryReferenceTableImpl<T>
  extends BaseReferenceTable<T>
  implements RefTableQueries<T>
{
  public insertQry = (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ): SQLExpression => {
    const changes: IInsertQryParameters<T> =
      typeof prmsOrCb === 'object'
        ? prmsOrCb
        : prmsOrCb(this as any as ReferencedTable<T>);
    return new InsertTableQuery({
      tbl: this as any as ReferencedTable<T>,
      ...changes
    });
  };

  public insertQrySql = (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ): string => {
    const tblQuery = this.insertQry(prmsOrCb);
    return tblQuery.toSql();
  };

  public updateQry = (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ): SQLExpression => {
    const tblRef = this as any as ReferencedTable<T>;
    const changes: IUpdateQryParameters<T> =
      typeof prmsOrCb === 'object' ? prmsOrCb : prmsOrCb(tblRef);
    return new UpdateTableQuery({
      tbl: tblRef,
      ...changes
    });
  };

  public updateQrySql = (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ): string => {
    const tblQuery = this.updateQry(prmsOrCb);
    return tblQuery.toSql();
  };

  public selectQry = (
    propsOrCb:
      | ITableSelectQryParameters<T>
      | IGenerateParametersCallbackFn<T> = {}
  ): SelectQuery => {
    const refTbl: ReferencedTable<T> = this as any as ReferencedTable<T>;
    return tableSelectQry(refTbl, propsOrCb);
  };

  public selectQrySql = (
    propsOrCb:
      | ITableSelectQryParameters<T>
      | IGenerateParametersCallbackFn<T> = {}
  ): string => {
    const tblQuery = this.selectQry(propsOrCb);
    return tblQuery.toSql();
  };

  public deleteQry = (
    propsOrCb:
      | IDeleteQryParameters
      | IGenerateDeleteParametersCallbackFn<T> = {}
  ) => {
    const refTbl: ReferencedTable<T> = this as any as ReferencedTable<T>;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return deleteQuery(refTbl, propsOrCb);
  };

  public deleteQrySql = (
    propsOrCb:
      | IDeleteQryParameters
      | IGenerateDeleteParametersCallbackFn<T> = {}
  ) => {
    const refTbl: ReferencedTable<T> = this as any as ReferencedTable<T>;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return deleteQuerySql(refTbl, propsOrCb);
  };
}

export function createQueryReferencedTable<T>(
  dbTable: IDBTable<T>,
  alias?: string
): QueryReferenceTable<T> {
  return new QueryReferenceTableImpl(
    dbTable,
    alias
  ) as any as QueryReferenceTable<T>;
}

export function tbl<T>(
  tblOrDef: ReferencedTable<T> | IDBTable<T> | TableDefinition<T>,
  alias?: string
): QueryReferenceTable<T> {
  const tbl = createQueryReferencedTable(
    isReferencedTable<T>(tblOrDef)
      ? tblOrDef.tbl
      : isDBTable<T>(tblOrDef)
      ? tblOrDef
      : createDBTbl(tblOrDef),
    alias
  );
  return tbl as QueryReferenceTable<T>;
}
