import {ISQLExpression} from './query/SQLExpression';
import {DBField, DBTable} from './dbModel';
import {ToStringFn} from './query/sqlQuery';

interface IBaseFieldDefinition<DataType> {
  dbName: string;
  name: keyof DataType;
}

export interface ITableFieldDefinition<DataType>
  extends IBaseFieldDefinition<DataType> {
  isEncrypted?: boolean;
  isHash?: boolean;
  isPwHash?: boolean;
  isCC?: boolean;
  isInsertTimestamp?: boolean;
  isUpdateTimestamp?: boolean;
}

export interface ITableCalculateFieldDefinition<DataType>
  extends IBaseFieldDefinition<DataType> {
  calculation: (qryTbl: ReferencedTable<ITable<DataType>>) => ISQLExpression;
}

export interface ITableField<T> extends ITableFieldDefinition<T> {
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface ITableDefinition<DataType> {
  dbName: string;
  name: string;
  fields: ITableFieldDefinition<DataType>[];
  calculatedFields: ITableCalculateFieldDefinition<DataType>[];
}

export interface ITable<DataType> extends ITableDefinition<DataType> {
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
}

export interface IFieldReference<T = any> extends ISQLExpression {
  field: DBField<T>;
  qryTbl: ReferencedTable<T>;
  toSelectSql: () => string;
  toReferenceSql: () => string;
  toUpdateFieldSql: (val: ISQLExpression) => string;
  readValueToSql: (val: ISQLExpression) => ISQLExpression;
  writeValueToSQL: (val: ISQLExpression) => string | ISQLExpression;
}

export type IFieldReferenceFn<T = any> = (
  newAlias?: string
) => IFieldReference<T>;

export type ReferencedTable<T> = {
  [P in keyof Required<T>]: IFieldReferenceFn<T[P]>;
} & {
  alias?: string;
  tbl: DBTable<T>;
  toSql: ToStringFn;
  toReferenceSql: ToStringFn;
};
