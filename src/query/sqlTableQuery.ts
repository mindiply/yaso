import indentString from 'indent-string';
import {
  FieldReference,
  IFieldReference,
  IFieldReferenceFn
} from './sqlFieldReference';
import {createDBTbl, DBTable} from '../dbModel';
import {createFieldReferenceFn, ToStringFn} from './sqlQuery';
import {countNLines} from './utils';
import {
  DataValue,
  ISQLExpression,
  transformFieldUpdatesToSql
} from './SQLExpression';
import {ITableDefinition} from '../dbTypes';

export type TableFieldUpdates<T> = {
  [P in keyof T]?: DataValue | ISQLExpression;
};

type SelectFieldRef<T> = keyof T | ISQLExpression;

interface ITableSelectQryParameters<T> {
  fields?: SelectFieldRef<T>[];
  where?: ISQLExpression;
}

type SelectFn<T> = (parameters: ITableSelectQryParameters<T>) => string;

export interface IInsertQryParameters<T> {
  fields: TableFieldUpdates<T>;
  returnFields?: boolean | Array<keyof T>;
}

type InsertFn<T> = (parameters: IInsertQryParameters<T>) => string;

export interface IUpdateQryParameters<T> extends IInsertQryParameters<T> {
  where: ISQLExpression;
}

type UpdateFn<T> = (parameters: IUpdateQryParameters<T>) => string;

export interface ITableQuery<T> {
  updateQrySql: UpdateFn<T>;
  insertQrySql: InsertFn<T>;
  selectQrySql: SelectFn<T>;
}

type FieldsToStrMapperFn<T> = (
  fieldNames: Array<keyof T> | undefined
) => string;

class ReferencedTableImpl<T = any> implements ITableQuery<T> {
  [fieldname: string]:
    | IFieldReferenceFn
    | DBTable
    | ToStringFn
    | InsertFn<T>
    | UpdateFn<T>
    | SelectFn<T>
    | typeof ReferencedTableImpl.prototype.mapUpdateEntryToSql
    | typeof ReferencedTableImpl.prototype.addUpdateFieldsIfNeeded
    | FieldsToStrMapperFn<T>
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
      this[field.name as string] = createFieldReferenceFn(
        this as ReferencedTable<T>,
        field
      );
    });
  }

  public toSql = (): string =>
    `${this.tbl.dbName}${this.alias ? ` as "${this.alias}"` : ''}`;
  public toReferenceSql = (): string => this.alias || this.tbl.dbName;

  public updateQrySql: UpdateFn<T> = ({
    fields: inputChanges,
    where,
    returnFields
  }) => {
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
    let sql = `update ${this.toSql()}
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
    if (returnFields) {
      sql += this.returningFieldsSql(
        Array.isArray(returnFields) ? returnFields : undefined
      );
    }
    return sql;
  };

  public insertQrySql: InsertFn<T> = ({
    fields: inputChanges,
    returnFields
  }): string => {
    const changes = this.addUpdateFieldsIfNeeded(inputChanges, true);
    const changeFields: Array<[string, ISQLExpression]> = Object.entries(
      transformFieldUpdatesToSql(changes)
    );
    changeFields.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] === b[0]) return 0;
      return 1;
    });
    const fldList: string[] = [];
    const valList: string[] = [];
    changeFields.forEach(([fieldName, fieldValue]) => {
      console.log({fieldName, fieldValue});
      const fieldRef = (this[fieldName] as IFieldReferenceFn<
        T
      >)() as FieldReference<T>;
      fldList.push(fieldRef.field.dbName);
      valList.push(fieldRef.writeValueToSQL(fieldValue, true));
    });

    const fieldList = fldList.join(',\n');
    const valueList = valList.join(',\n');
    let sql = `insert into ${this.tbl.dbName} (${
      changeFields.length > 1 ? '\n' : ''
    }${changeFields.length > 1 ? indentString(fieldList, 2) : fieldList}${
      changeFields.length > 1 ? '\n' : ''
    }) values (${changeFields.length > 1 ? '\n' : ''}${
      changeFields.length > 1 ? indentString(valueList, 2) : valueList
    }${changeFields.length > 1 ? '\n' : ''})`;
    if (returnFields) {
      sql += this.returningFieldsSql(
        Array.isArray(returnFields) ? returnFields : undefined
      );
    }
    return sql;
  };

  public selectQrySql = (prms: ITableSelectQryParameters<T> = {}): string => {
    const {fields, where} = prms;
    const fieldsSql = this.fieldsTableSelect(fields);
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

  protected fieldsTableSelect = (
    fieldRefs: SelectFieldRef<T>[] | undefined
  ): string => {
    const selectFields = fieldRefs
      ? fieldRefs.map(fieldRef => {
          if (typeof fieldRef === 'string') {
            return (this[fieldRef as string] as IFieldReferenceFn)();
          }
          return fieldRef as IFieldReference;
        })
      : this.tbl.fields.map(field =>
          (this[field.name as string] as IFieldReferenceFn)()
        );
    selectFields.sort((a, b) => {
      if ((a.alias || '') < (b.alias || '')) {
        return -1;
      }
      if ((a.alias || '') == (b.alias || '')) {
        return 0;
      }
      return 1;
    });
    const fieldsSql = selectFields
      .map(field => (field.toSelectSql ? field.toSelectSql() : field.toSql()))
      .join(',\n');
    return fieldsSql;
  };

  protected returningFieldsSql = (
    fieldNames: Array<keyof T> | undefined
  ): string => {
    const returnSql = this.fieldsTableSelect(fieldNames);
    const nReturnLines = countNLines(returnSql);
    if (nReturnLines > 0) {
      return `\nreturning${
        nReturnLines > 1 ? '\n' + indentString(returnSql, 2) : ' ' + returnSql
      }`;
    } else {
      return '';
    }
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

interface ITableStatementSql<T> extends ISQLExpression {
  qryTbl: ReferencedTable<T>;
}

// class BaseTableStatementSql<T> extends BaseSqlExpression
//   implements ITableStatementSql<T> {
//   public qryTbl: ReferencedTable<T>;
//
//   constructor(qryTbl: ReferencedTable<T>) {
//     super();
//     this.qryTbl = qryTbl;
//   }
// }

export const updateQuerySql = <T>(
  dbTable: DBTable<T>,
  changes: TableFieldUpdates<T>,
  where: ISQLExpression,
  returning?: Array<keyof T> | boolean
): string => {
  const tblQuery = new ReferencedTableImpl(dbTable);
  return tblQuery.updateQrySql({
    fields: changes,
    where,
    returnFields: returning
  });
};

type IGenerateInsertParametersCallbackFn<T> = (
  qryTable: ReferencedTable<T>
) => IInsertQryParameters<T>;

interface ITableUpdatedQrySql {
  <T>(
    dbTable: DBTable<T>,
    changes: TableFieldUpdates<T>,
    returnFields?: boolean | Array<keyof T>
  ): string;
  <T>(dbTable: DBTable<T>, cb: IGenerateInsertParametersCallbackFn<T>): string;
}
export const insertQuerySql: ITableUpdatedQrySql = <T>(
  dbTable: DBTable<T>,
  changesOrCb: TableFieldUpdates<T> | IGenerateInsertParametersCallbackFn<T>,
  returnFields?: boolean | Array<keyof T>
): string => {
  const tblQuery = createReferencedTable(dbTable);
  const changes: IInsertQryParameters<T> =
    typeof changesOrCb === 'object'
      ? {fields: changesOrCb, returnFields}
      : changesOrCb(tblQuery);
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
