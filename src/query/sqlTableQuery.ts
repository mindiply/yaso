import indentString from 'indent-string';
import {
  BaseReferenceTable,
  createReferencedTable,
  FieldReference
} from './sqlTableFieldReference';
import {createDBTbl, IDBTable, isDBTable} from '../dbModel';
import {countNLines} from './utils';
import {QueryContext, transformFieldUpdatesToSql} from './SQLExpression';
import {ITableDefinition} from '../dbTypes';
import {
  IFieldReference,
  IFieldReferenceFn,
  IQueryContext,
  ISQLExpression,
  ISQLOrderByExpression,
  ReferencedTable,
  TableFieldUpdates,
  ToStringFn
} from './types';

export type SelectFieldRef<T> = keyof T | ISQLExpression;

interface ITableQryBaseParameters<T> {
  tbl: ReferencedTable<T>;
}

interface ITableSelectQryParameters<T> {
  fields?: SelectFieldRef<T>[];
  where?: ISQLExpression;
  orderBy?: ISQLOrderByExpression;
}

export interface IInsertQryParameters<T> {
  fields: TableFieldUpdates<T>;
  returnFields?: boolean | Array<keyof T>;
}

export interface IUpdateQryParameters<T> extends IInsertQryParameters<T> {
  where: ISQLExpression;
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
    const selectFields = fieldRefs
      ? fieldRefs.map(fieldRef => {
          if (typeof fieldRef === 'string') {
            return ((this.refTbl as BaseReferenceTable)[
              fieldRef as string
            ] as IFieldReferenceFn)();
          }
          return fieldRef as IFieldReference;
        })
      : this.refTbl.tbl.fields.map(field =>
          ((this.refTbl as BaseReferenceTable)[
            field.name as string
          ] as IFieldReferenceFn)()
        );
    selectFields.sort((a, b) => {
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
    const fieldsSql = selectFields
      .map(field =>
        field.toSelectSql
          ? field.toSelectSql(qryContext)
          : field.toSql(qryContext)
      )
      .join(',\n');
    return fieldsSql;
  };

  public isSimpleValue = () => false;
}

class SelectTableQuery<T> extends BaseTableQuery<T> implements ISQLExpression {
  protected fields?: SelectFieldRef<T>[];
  protected where?: ISQLExpression;
  protected orderBy?: ISQLOrderByExpression;

  constructor({
    tbl,
    fields,
    where,
    orderBy
  }: ITableSelectQryParameters<T> & ITableQryBaseParameters<T>) {
    super(tbl);
    this.fields = fields;
    this.where = where;
    this.orderBy = orderBy;
  }

  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    qryContext.addTable(this.refTbl);
    const fieldsSql = this.fieldsTableSelect(qryContext, this.fields);
    const nFieldsLineCount = countNLines(fieldsSql);
    const whereSql = this.where ? this.where.toSql(qryContext) : '';
    const whereLineCount = countNLines(whereSql);
    const orderBySql = this.orderBy ? this.orderBy.toSql(qryContext) : '';
    return `select${nFieldsLineCount > 1 ? '\n' : ''}${indentString(
      fieldsSql,
      nFieldsLineCount > 1 ? 2 : 1
    )}
from ${this.refTbl.toSql(qryContext)}${
      whereSql
        ? '\nwhere' +
          (whereLineCount > 1
            ? '\n' + indentString(whereSql, 2)
            : ' ' + whereSql)
        : ''
    }${orderBySql ? `\n${orderBySql}` : ''}`;
  };
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
export const tableSelectSql: ITableSelectQrySql = <T>(
  dbTable: IDBTable<T> | ReferencedTable<T>,
  propsOrCb:
    | ITableSelectQryParameters<T>
    | IGenerateParametersCallbackFn<T> = {}
): string => {
  const refTbl: ReferencedTable<T> = isDBTable<T>(dbTable)
    ? createReferencedTable(dbTable)
    : (dbTable as ReferencedTable<T>);
  const props = typeof propsOrCb === 'function' ? propsOrCb(refTbl) : propsOrCb;
  const tblQuery = new SelectTableQuery({...props, tbl: refTbl});
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
    [fieldName, fieldValue]: [string, ISQLExpression]
  ): string => {
    const field = ((this.refTbl as BaseReferenceTable)[
      fieldName
    ] as IFieldReferenceFn)();
    return field.toUpdateFieldSql(fieldValue).toSql(qryContext);
  };
}

class InsertTableQuery<T> extends BaseWriteTableQuery<T>
  implements ISQLExpression {
  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    qryContext.addTable(this.refTbl);
    this.addUpdateFieldsIfNeeded(true);
    const changeFields: Array<[string, ISQLExpression]> = Object.entries(
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
      const fieldRef = ((this.refTbl as BaseReferenceTable)[
        fieldName
      ] as IFieldReferenceFn<T>)() as FieldReference<T>;
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

class UpdateTableQuery<T> extends BaseWriteTableQuery<T>
  implements ISQLExpression {
  protected where: ISQLExpression;

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
    const changeFields: Array<[string, ISQLExpression]> = Object.entries(
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

type MemberFn = (...prms: any[]) => any;

type QueryReferenceTable<T> = ReferencedTable<T> & {
  insertQry: (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ) => ISQLExpression;
  insertQrySql: (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ) => string;
  updateQry: (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ) => ISQLExpression;
  updateQrySql: (
    prmsOrCb: IUpdateQryParameters<T> | IGenerateUpdateParametersCallbackFn<T>
  ) => string;
  selectQry: (
    propsOrCb: ITableSelectQryParameters<T> | IGenerateParametersCallbackFn<T>
  ) => ISQLExpression;
  selectQrySql: (
    propsOrCb: ITableSelectQryParameters<T> | IGenerateParametersCallbackFn<T>
  ) => string;
};

class QueryReferenceTableImpl<T> extends BaseReferenceTable<T> {
  [fieldname: string]:
    | IFieldReferenceFn
    | IDBTable<T>
    | string
    | undefined
    | ToStringFn
    | MemberFn;

  public insertQry = (
    prmsOrCb: IInsertQryParameters<T> | IGenerateInsertParametersCallbackFn<T>
  ): ISQLExpression => {
    const changes: IInsertQryParameters<T> =
      typeof prmsOrCb === 'object'
        ? prmsOrCb
        : prmsOrCb(this as ReferencedTable<T>);
    return new InsertTableQuery({
      tbl: this as ReferencedTable<T>,
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
  ): ISQLExpression => {
    const tblRef = this as ReferencedTable<T>;
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
  ): ISQLExpression => {
    const refTbl: ReferencedTable<T> = this as ReferencedTable<T>;
    const props =
      typeof propsOrCb === 'function' ? propsOrCb(refTbl) : propsOrCb;
    return new SelectTableQuery({...props, tbl: refTbl});
  };

  public selectQrySql = (
    propsOrCb:
      | ITableSelectQryParameters<T>
      | IGenerateParametersCallbackFn<T> = {}
  ): string => {
    const tblQuery = this.selectQry(propsOrCb);
    return tblQuery.toSql();
  };
}

export function createQueryReferencedTable<T>(
  dbTable: IDBTable<T>,
  alias?: string
): QueryReferenceTable<T> {
  return new QueryReferenceTableImpl(dbTable, alias) as QueryReferenceTable<T>;
}

export function tbl<T>(
  tblOrDef: IDBTable<T> | ITableDefinition<T>,
  alias?: string
): QueryReferenceTable<T> {
  const tbl = createQueryReferencedTable(
    isDBTable<T>(tblOrDef)
      ? tblOrDef
      : createDBTbl(tblOrDef as ITableDefinition<T>),
    alias
  );
  return tbl as QueryReferenceTable<T>;
}
