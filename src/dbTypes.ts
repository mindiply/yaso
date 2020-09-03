interface BaseFieldDefinition<ObjShape> {
  dbName: string;
  name: keyof ObjShape;
}

export interface TableFieldDefinition<ObjShape>
  extends BaseFieldDefinition<ObjShape> {
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
export interface ToSqlFn {
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
  addTable: (tbl: ResultSet<any>, alias?: string) => string;

  /**
   * It returns the alias assigned to a specific referenced table object,
   * using the === operator to find it.
   * @param tbl
   */
  tableRefAlias: (tbl: ResultSet<any>) => null | string;
}

export interface Aliased {
  /**
   * Represents the alias of a SQL expression (could be a table field,
   * a subquery, a table, a view).
   *
   * For database objects it may return the underlying database name if
   * an alias was not specified
   */
  alias: string;
}

/**
 * A ISQLExpression is the building block of SQL clauses and
 * statements.
 *
 * The main function is toSQL which provides the string representation
 * of the expression. Some expressions will throw an error if they need
 * an initialized query context and it is not provided.
 */
export interface SQLExpression {
  toSql: ToSqlFn;
  isSimpleValue: () => boolean;
}

export interface SQLAliasedExpression extends SQLExpression, Aliased {
  readonly isExplicitAlias: boolean;
}

/**
 * Represents a resultSet, which could be a table, a view
 * or a subTable
 */
export interface ResultSet<
  ObjShape,
  Refs =
    | ColumnReferenceFn<ObjShape>
    | TableFieldReferenceFn<ObjShape>
    | CalculatedFieldReferenceFn<ObjShape>
> extends SQLAliasedExpression {
  toReferenceSql: ToSqlFn;
  readonly name: string;
  readonly cols: ColumnsRefs<ObjShape, Refs>;
}

export interface ResultColumn<ObjShape> extends SQLAliasedExpression {
  /**
   * The result set this column belongs to - table, view, subquery
   */
  resultSet: ResultSet<ObjShape>;

  /**
   * Returns a sql expression to be used in a select statement to
   * get the desired column with the current **alias**.
   *
   * For tables: tst.tst_id as "_id"
   * For calculated fields: (subQuery) as "calc"
   * For subtables, subtable.columnAlias as "columnAlias"
   *
   * @returns {SQLExpression}
   */
  toSelectSql: () => SQLAliasedExpression;

  /**
   * Just refer to the field using the table alias and the field
   * database name, without adding or using the alias. It's the
   * same as toSql()
   *
   * For tables: tst.tst_id
   * For calculated fields: (subQuery)
   * For subtables: subtable.columnAlias
   *
   * @param qryContext
   */
  toReferenceSql: () => SQLExpression;
}

/**
 * Represents a table used in a from clause of a sql statement.
 */
export interface ReferencedTable<ObjShape>
  extends ResultSet<
    ObjShape,
    TableFieldReferenceFn<ObjShape> | CalculatedFieldReferenceFn<ObjShape>
  > {
  tbl: IDBTable<ObjShape>;
  readonly fields: Map<keyof ObjShape, TableFieldReference<ObjShape>>;
}

/**
 * Base type for field references, used by both actual table
 * fields and calculated fields. The key element is they need
 * a reference table to work
 */
export interface BaseTableFieldReference<Table = any>
  extends ResultColumn<Table> {
  readonly qryTbl: ReferencedTable<Table>;
}

export interface CalculatedFieldReference<Table = any>
  extends BaseTableFieldReference<Table> {
  readonly field: TableCalculateFieldDefinition<Table>;

  toSelectSql: () => SQLAliasedExpression;

  /**
   * Just refer to the field using the table alias and the field
   * database name, without adding or using the alias. It's the
   * same as toSql()
   * @param qryContext
   */
  readValueToSql: () => SQLExpression;
}

/**
 * Represents a reference to a specific field of a referenced
 * table within a query.
 *
 * The field can be used in different types and parts of statements
 * - in the where condition, as part of update statements, in the select
 * part of the statement.
 */
export interface TableFieldReference<Table = any>
  extends BaseTableFieldReference<Table> {
  readonly field: IDBField<Table>;
  toUpdateFieldSql: (val: SQLExpression) => SQLExpression;
  readValueToSql: (val?: SQLExpression) => SQLExpression;
  writeValueToSQL: (val?: SQLExpression, isInsert?: boolean) => SQLExpression;
}

export interface ColumnReferenceFn<ObjShape> extends SQLExpression {
  (newAlias?: string): ResultColumn<ObjShape>;
}

export interface TableFieldReferenceFn<ObjShape> extends SQLExpression {
  (newAlias?: string): TableFieldReference<ObjShape>;
}

export interface CalculatedFieldReferenceFn<ObjShape> extends SQLExpression {
  (newAlias?: string): CalculatedFieldReference<ObjShape>;
}

export interface CalculatedFieldCalcFn<DataType = any> {
  (qryTbl: ReferencedTable<DataType>): SQLExpression;
}

export interface TableCalculateFieldDefinition<DataType>
  extends BaseFieldDefinition<DataType> {
  calculation: CalculatedFieldCalcFn<DataType>;
}

export type ColumnsRefs<ObjShape, RefType = ColumnReferenceFn<ObjShape>> = {
  [P in keyof Required<ObjShape>]: RefType;
};

export interface TableField<T> extends TableFieldDefinition<T> {
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface TableDefinition<DataType> {
  dbName: string;
  name: string;
  fields: TableFieldDefinition<DataType>[];
  calculatedFields?: TableCalculateFieldDefinition<DataType>[];
}

export interface Table<DataType> extends TableDefinition<DataType> {
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
}

export interface IDBField<ObjShape> extends TableField<ObjShape> {
  readonly name: keyof ObjShape;
  dbName: string;
  isEncrypted: boolean;
  isHash: boolean;
  isPwHash: boolean;
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface IDBTable<ObjShape = any> extends Table<ObjShape> {
  fields: IDBField<ObjShape>[];
  ccField?: IDBField<ObjShape>;
  insertTimestampField?: IDBField<ObjShape>;
  updateTimestampField?: IDBField<ObjShape>;
  getFieldByName: (
    fieldName: keyof ObjShape
  ) => TableFieldDefinition<ObjShape> | undefined;
  getFieldByDbName: (
    fieldDbName: string
  ) => TableFieldDefinition<ObjShape> | undefined;
}

export function isIDBTable(obj: any): obj is IDBTable<any> {
  if (!(obj && typeof obj === 'object')) {
    return false;
  }
  return Boolean(
    obj.getFieldByName &&
      typeof obj.getFieldByName === 'function' &&
      obj.getFieldByDbName &&
      typeof obj.getFieldByDbName === 'function'
  );
}
