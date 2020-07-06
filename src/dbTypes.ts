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

/**
 * the .toSql function signature (or any toXXXSql function), which
 * accepts an optional query context object to determine the alias
 * of the table the sql expression belongs to.
 */
export interface IToSqlFn {
  (qryContext?: IQueryContext): string;
}

/**
 * A query context is used provide unique aliases to the
 * tables within a sql query.
 */
export interface IQueryContext {
  /**
   * Adds a table to be referenced to the context, and returns
   * a unique alias it is assigned to.
   * @param tbl The referenced table
   * @param alias An alias if the alias is provided by the client
   */
  addTable: <T>(tbl: ReferencedTable<T>, alias?: string) => string;

  /**
   * It returns the alias assigned to a specific referenced table object,
   * using the === operator to find it.
   * @param tbl
   */
  tableRefAlias: <T>(tbl: ReferencedTable<T>) => null | string;
}

/**
 * A ISQLExpression is the building block of SQL clauses and
 * statements.
 *
 * The main function is toSQL which provides the string representation
 * of the expression. Some expressions will throw an error if they need
 * an initialized query context and it is not provided.
 */
export interface ISQLExpression {
  toSql: IToSqlFn;
  isSimpleValue: () => boolean;
}

/**
 * Represents a table used in a from clause of a sql statement.
 */
export interface IFromTable<T> extends ISQLExpression {
  alias?: string;
  tbl: IDBTable<T>;
  toReferenceSql: IToSqlFn;
  readonly fields: Map<keyof T, IFieldReference<T>>;
}

/**
 * Base type for field references, used by both actual table
 * fields and calculated fields. The key element is they need
 * a reference table to work
 */
export interface IBaseFieldReference<Table = any> extends ISQLExpression {
  readonly alias: string;
  readonly qryTbl: ReferencedTable<Table>;
}

export interface ICalculatedFieldReference<Table = any>
  extends IBaseFieldReference<Table> {
  readonly field: ITableCalculateFieldDefinition<Table>;

  toSelectSql: () => ISQLExpression;

  /**
   * Just refer to the field using the table alias and the field
   * database name, without adding or using the alias. It's the
   * same as toSql()
   * @param qryContext
   */
  readValueToSql: () => ISQLExpression;
}

/**
 * Represents a reference to a specific field of a referenced
 * table within a query.
 *
 * The field can be used in different types and parts of statements
 * - in the where condition, as part of update statements, in the select
 * part of the statement.
 */
export interface IFieldReference<Table = any>
  extends IBaseFieldReference<Table> {
  /**
   * If the field has been aliased that alias is returned, otherwise
   * the database name of the field
   */
  readonly field: IDBField<Table>;
  toSelectSql: () => ISQLExpression;

  /**
   * Just refer to the field using the table alias and the field
   * database name, without adding or using the alias. It's the
   * same as toSql()
   * @param qryContext
   */
  toReferenceSql: () => ISQLExpression;
  toUpdateFieldSql: (val: ISQLExpression) => ISQLExpression;
  readValueToSql: (val?: ISQLExpression) => ISQLExpression;
  writeValueToSQL: (val?: ISQLExpression) => ISQLExpression;
}

export function isIFieldReference(obj: any): obj is IFieldReference<any> {
  if (
    typeof obj === 'object' &&
    obj.field &&
    typeof obj.toSelectSql === 'function' &&
    typeof obj.toReferenceSql === 'function' &&
    typeof obj.toUpdateFieldSql === 'function' &&
    typeof obj.readValueToSql === 'function' &&
    typeof obj.writeValueToSQL === 'function'
  ) {
    return true;
  }
  return false;
}

export interface IFieldReferenceFn<T = any> extends ISQLExpression {
  (newAlias?: string): IFieldReference<T>;
}

export interface ICalculatedFieldReferenceFn<T = any> extends ISQLExpression {
  (newAlias?: string): ICalculatedFieldReference<T>;
}

export type TableFieldsMap<TableDef> = {
  [P in keyof Required<
    TableDef
  >]: TableDef[P] extends ITableCalculateFieldDefinition<any>
    ? ICalculatedFieldReference<TableDef>
    : IFieldReferenceFn<TableDef>;
};

export type ReferencedTable<T> = TableFieldsMap<T> & IFromTable<T>;

export interface ITableCalculateFieldDefinition<DataType>
  extends IBaseFieldDefinition<DataType> {
  calculation: (qryTbl: ReferencedTable<DataType>) => ISQLExpression;
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
  calculatedFields?: ITableCalculateFieldDefinition<DataType>[];
}

export interface ITable<DataType> extends ITableDefinition<DataType> {
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
}

export interface IDBField<T> extends ITableField<T> {
  readonly name: keyof T;
  dbName: string;
  isEncrypted: boolean;
  isHash: boolean;
  isPwHash: boolean;
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface IDBTable<DataType = any> extends ITable<DataType> {
  fields: IDBField<DataType>[];
  ccField?: IDBField<DataType>;
  insertTimestampField?: IDBField<DataType>;
  updateTimestampField?: IDBField<DataType>;
  getFieldByName: (
    fieldName: keyof DataType
  ) => ITableFieldDefinition<DataType> | undefined;
  getFieldByDbName: (
    fieldDbName: string
  ) => ITableFieldDefinition<DataType> | undefined;
}
