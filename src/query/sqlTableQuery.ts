import indentString from 'indent-string';
import {FieldReference, IFieldReferenceFn} from './sqlFieldReference';
import {createDBTbl, DBTable} from '../dbModel';
import {createFieldReferenceFn, ToStringFn} from './sqlQuery';
import {countNLines, parenthesizeSql} from './utils';
import {
  DataValue,
  ISQLExpression,
  transformFieldUpdatesToSql
} from './SQLExpression';
import {ITableDefinition} from '../dbTypes';

export type TableFieldUpdates<T> = {
  [P in keyof T]?: DataValue | ISQLExpression;
};

export interface ITableQuery<T> {
  updateQrySql: (
    changes: TableFieldUpdates<T>,
    where: ISQLExpression
  ) => string;
  insertQrySql: (info: TableFieldUpdates<T>) => string;
  selectQrySql: (prms?: {
    fields?: Array<keyof T>;
    where: ISQLExpression;
  }) => string;
}

type UpdateFn<T> = (
  changes: TableFieldUpdates<T>,
  where: ISQLExpression
) => string;

export type ITableQueryCallback = <T>(tblQry: ITableQuery<T>) => void;

interface ITableSelectQryParameters<T> {
  fields?: Array<keyof T>;
  where?: ISQLExpression;
}

class ReferencedTableImpl<T = any> implements ITableQuery<T> {
  [fieldname: string]:
    | IFieldReferenceFn
    | DBTable
    | ToStringFn
    | UpdateFn<T>
    | typeof ReferencedTableImpl.prototype.mapUpdateEntryToSql
    | typeof ReferencedTableImpl.prototype.addUpdateFieldsIfNeeded
    | string
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
        this as ReferencedTable<T>,
        field
      );
    });
  }

  public toSql = (): string =>
    `${this.tbl.dbName}${this.alias ? ` as "${this.alias}"` : ''}`;
  public toReferenceSql = (): string => this.alias || this.tbl.dbName;

  public updateQrySql = (
    inputChanges: TableFieldUpdates<T>,
    where: ISQLExpression
  ) => {
    const changes = this.addUpdateFieldsIfNeeded(inputChanges);
    const changeFields: Array<[string, ISQLExpression]> = Object.entries(
      transformFieldUpdatesToSql(changes)
    );
    changeFields.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] === b[0]) return 0;
      return 1;
    });
    const whereSql = where.toSql();
    const nLinesWhere = countNLines(whereSql);
    return `update ${this.toSql()}
set${changeFields.length > 1 ? '\n' : ''}${indentString(
      changeFields
        .map(([fieldName, fieldValue]) =>
          this.mapUpdateEntryToSql([fieldName, fieldValue])
        )
        .join(',\n'),
      changeFields.length > 1 ? 2 : 1
    )}
where${nLinesWhere > 1 ? '\n' : ''}${indentString(
      where.toSql(),
      nLinesWhere > 1 ? 2 : 1
    )}`;
  };

  public insertQrySql = (inputChanges: TableFieldUpdates<T>): string => {
    const changes = this.addUpdateFieldsIfNeeded(inputChanges);
    const changeFields: Array<[string, ISQLExpression]> = Object.entries(
      transformFieldUpdatesToSql(changes)
    );
    changeFields.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] === b[0]) return 0;
      return 1;
    });
    const fieldList = changeFields
      .map(
        ([fieldName]) =>
          ((this[fieldName] as IFieldReferenceFn<T>)() as FieldReference<T>)
            .field.dbName
      )
      .join(',\n');

    const valueList = changeFields
      .map(nameValue =>
        nameValue[1].isSimpleValue()
          ? nameValue[1].toSql()
          : parenthesizeSql(nameValue[1].toSql())
      )
      .join(',\n');
    return `insert into ${this.tbl.dbName} (${
      changeFields.length > 1 ? '\n' : ''
    }${changeFields.length > 1 ? indentString(fieldList, 2) : fieldList}${
      changeFields.length > 1 ? '\n' : ''
    }) values (${changeFields.length > 1 ? '\n' : ''}${
      changeFields.length > 1 ? indentString(valueList, 2) : valueList
    }${changeFields.length > 1 ? '\n' : ''})`;
  };

  public selectQrySql = (prms: ITableSelectQryParameters<T> = {}): string => {
    const {fields, where} = prms;
    const selectFields = fields
      ? fields.map(fieldName =>
          (this[fieldName as string] as IFieldReferenceFn)()
        )
      : this.tbl.fields.map(field =>
          (this[field.name as string] as IFieldReferenceFn)()
        );
    selectFields.sort((a, b) => {
      if (a.field.name < b.field.name) {
        return -1;
      }
      if (a.field.name == b.field.name) {
        return 0;
      }
      return 1;
    });
    const fieldsSql = selectFields
      .map(field => field.toSelectSql())
      .join(',\n');
    const nFieldsLineCount = countNLines(fieldsSql);
    const whereSql = where ? where.toSql() : '';
    const whereLineCount = countNLines(whereSql);
    return `select${nFieldsLineCount > 1 ? '\n' : ''}${indentString(
      fieldsSql,
      nFieldsLineCount > 1 ? 2 : 1
    )}
from ${this.toSql()}${
      whereSql
        ? '\nwhere' +
          (whereLineCount > 1
            ? '\n' + indentString(whereSql, 2)
            : ' ' + whereSql)
        : ''
    }`;
  };

  protected addUpdateFieldsIfNeeded = (
    fieldChanges: TableFieldUpdates<T>,
    isInsert = false
  ): TableFieldUpdates<T> => {
    const addedChanges: TableFieldUpdates<T> = {};
    if (
      this.tbl.hasCC &&
      this.tbl.ccField &&
      !(this.tbl.ccField.name in fieldChanges)
    ) {
      addedChanges[this.tbl.ccField.name as keyof T] = undefined;
    }
    if (
      this.tbl.hasUpdateTimestamp &&
      this.tbl.updateTimestampField &&
      !(this.tbl.updateTimestampField.name in fieldChanges)
    ) {
      addedChanges[this.tbl.updateTimestampField.name as keyof T] = undefined;
    }
    if (
      isInsert &&
      this.tbl.hasInsertTimestamp &&
      this.tbl.insertTimestampField &&
      !(this.tbl.insertTimestampField.name in fieldChanges)
    ) {
      addedChanges[this.tbl.insertTimestampField.name as keyof T] = undefined;
    }
    if (Object.keys(addedChanges).length > 0) {
      return {...addedChanges, ...fieldChanges};
    }
    return fieldChanges;
  };

  protected mapUpdateEntryToSql = ([fieldName, fieldValue]: [
    string,
    ISQLExpression
  ]): string => {
    const field = (this[fieldName] as IFieldReferenceFn)();
    return field.toUpdateFieldSql(fieldValue);
  };
}

type IReferencedTable<T> = ReferencedTableImpl<T>;

export type ReferencedTable<T> = IReferencedTable<T> &
  {
    [P in keyof T]: IFieldReferenceFn<T[P]>;
  };

export function createReferencedTable<T>(
  dbTable: DBTable<T>,
  alias?: string
): ReferencedTable<T> {
  return new ReferencedTableImpl(dbTable, alias) as ReferencedTable<T>;
}

export const updateQuerySql = <T>(
  dbTable: DBTable<T>,
  changes: TableFieldUpdates<T>,
  where: ISQLExpression
): string => {
  const tblQuery = new ReferencedTableImpl(dbTable);
  return tblQuery.updateQrySql(changes, where);
};

type IGenerateChangesCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => TableFieldUpdates<T>;

interface ITableUpdatedQrySql {
  <T>(dbTable: DBTable<T>, changes: TableFieldUpdates<T>): string;
  <T>(dbTable: DBTable<T>, cb: IGenerateChangesCallbackFn<T>): string;
}
export const insertQuerySql: ITableUpdatedQrySql = <T>(
  dbTable: DBTable<T>,
  changesOrCb: TableFieldUpdates<T> | IGenerateChangesCallbackFn<T>
): string => {
  const tblQuery = createReferencedTable(dbTable);
  const changes =
    typeof changesOrCb === 'object' ? changesOrCb : changesOrCb(tblQuery);
  return tblQuery.insertQrySql(changes);
};

type IGenerateParamtersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => ITableSelectQryParameters<T>;

interface ITableSelectQrySql {
  <T>(dbTable: DBTable<T>, props: ITableSelectQryParameters<T>): string;
  <T>(dbTable: DBTable<T>, cb: IGenerateParamtersCallbackFn<T>): string;
  <T>(dbTable: ReferencedTable<T>, props: ITableSelectQryParameters<T>): string;
  <T>(dbTable: ReferencedTable<T>, cb: IGenerateParamtersCallbackFn<T>): string;
}
export const tableSelectSql: ITableSelectQrySql = <T>(
  dbTable: DBTable<T> | ReferencedTable<T>,
  propsOrCb: ITableSelectQryParameters<T> | IGenerateParamtersCallbackFn<T> = {}
): string => {
  const tblQuery: ReferencedTable<T> =
    dbTable instanceof DBTable ? createReferencedTable(dbTable) : dbTable;
  const props =
    typeof propsOrCb === 'function' ? propsOrCb(tblQuery) : propsOrCb;
  return tblQuery.selectQrySql(props);
};

export function tbl<T>(
  tblOrDef: DBTable<T> | ITableDefinition<T>,
  alias?: string
): ReferencedTable<T> {
  const tbl = createReferencedTable(
    tblOrDef instanceof DBTable
      ? tblOrDef
      : createDBTbl(tblOrDef as ITableDefinition<T>),
    alias
  );
  return tbl as ReferencedTable<T>;
}
