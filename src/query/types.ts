import {
  CalculatedFieldReference,
  IDBTable,
  TableFieldReference,
  ColumnReferenceFn,
  SQLExpression,
  ReferencedTable,
  ResultColumn,
  ResultSet,
  SQLAliasedExpression,
  TableDefinition
} from '../dbTypes';

export type Id = string | number;

export interface IId {
  _id: Id;
}

export interface ITbl extends IId {
  cc: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISqlAliasExpression extends SQLAliasedExpression {
  expression: SQLExpression;
}

export interface ISQLMathExpression extends SQLExpression {
  left: SQLExpression;
  right: SQLExpression;
  operator: MathBinaryOperator;
}

export enum NullComparatorType {
  isNull = 'isNull',
  isNotNull = 'isNotNull'
}

export interface IWhereNullCond extends SQLExpression {
  operand: SQLExpression;
  type: NullComparatorType;
}

export enum LogicalOperator {
  AND = 'and',
  OR = 'or',
  NOT = 'not'
}

export enum BinaryComparator {
  equals = '=',
  lessThan = '<',
  lessThanOrEqual = '<=',
  moreThan = '>',
  moreThanOrEqual = '>=',
  diffs = '<>'
}

export interface ISqlBinaryComparison extends SQLExpression {
  left: SQLExpression;
  right: SQLExpression;
  operator: BinaryComparator;
}

export interface ISqlLogicalExpression extends SQLExpression {
  operator: LogicalOperator;
  operands: SQLExpression | SQLExpression[];
}

export enum AggregateOperator {
  count = 'count',
  min = 'min',
  max = 'max',
  sum = 'sum'
}

export interface ISqlCaseBranch {
  condition: SQLExpression;
  then: SQLExpression;
}

export interface ISqlCaseExpression extends SQLExpression {
  whenBranches: ISqlCaseBranch[];
  elseVal?: SQLExpression;
}

export interface ISqlAggregateOperator extends SQLExpression {
  expression: SQLExpression;
  operator: AggregateOperator | string;
}

/**
 * Represents a list of sql expressions separated by a comma
 * and within brackets
 *
 * (expr1, expr2, ..., exprn)
 */
export interface ISqlListExpression extends SQLExpression {
  listItems: SQLExpression[];
}

export interface SQLFunctionCall extends SQLExpression {
  readonly functionName: string;
  readonly parameters: SQLExpression[];
}

export interface ISQLOrderByField<T = any> {
  field: SQLExpression | ResultColumn<T> | ColumnReferenceFn<T>;
  isDesc?: boolean;
}

export interface IOrderByClause extends SQLExpression {
  orderByFields: ISQLOrderByField[];
}

export enum InNotInOperator {
  in = 'in',
  notIn = 'not in'
}

export interface IInNotInStatement extends SQLExpression {
  type: InNotInOperator;
  left: SQLExpression;
  right: ISqlListExpression | ResultSet<any>;
}

export enum MathBinaryOperator {
  add = '+',
  subtract = '-',
  multiply = '*',
  divide = '/',
  modulo = '%'
}

export enum JoinType {
  inner = 'inner',
  leftOuter = 'leftOuter',
  rightOuter = 'rightOuter'
}

export interface IJoin<T1 = any, T2 = any, T3 = any, T4 = any>
  extends SQLExpression {
  type: JoinType;
  from: ColumnReferenceFn<T1> | IJoin<T1, T2>;
  to: ColumnReferenceFn<T1> | IJoin<T2, T3> | IJoin<T3, T4>;
  onFrom?: ColumnReferenceFn<T1 | T2>;
  onTo?: ColumnReferenceFn<T3 | T2 | T4>;
}

export interface IOrderByFn<RT = IOrderByClause> {
  <T>(fields: ISQLOrderByField<T>): RT;

  <T>(fields: [ISQLOrderByField<T>]): RT;

  <T1, T2>(fields: [ISQLOrderByField<T1>, ISQLOrderByField<T2>]): RT;

  <T1, T2, T3>(
    fields: [ISQLOrderByField<T1>, ISQLOrderByField<T2>, ISQLOrderByField<T3>]
  ): RT;

  <T1, T2, T3, T4>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>
    ]
  ): RT;

  <T1, T2, T3, T4, T5>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>
    ]
  ): RT;

  <T1, T2, T3, T4, T5, T6>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>,
      ISQLOrderByField<T6>
    ]
  ): RT;

  <T1, T2, T3, T4, T5, T6, T7>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>,
      ISQLOrderByField<T6>,
      ISQLOrderByField<T7>
    ]
  ): RT;

  <T1, T2, T3, T4, T5, T6, T7, T8>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>,
      ISQLOrderByField<T6>,
      ISQLOrderByField<T7>,
      ISQLOrderByField<T8>
    ]
  ): RT;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>,
      ISQLOrderByField<T6>,
      ISQLOrderByField<T7>,
      ISQLOrderByField<T8>,
      ISQLOrderByField<T9>
    ]
  ): RT;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
    fields: [
      ISQLOrderByField<T1>,
      ISQLOrderByField<T2>,
      ISQLOrderByField<T3>,
      ISQLOrderByField<T4>,
      ISQLOrderByField<T5>,
      ISQLOrderByField<T6>,
      ISQLOrderByField<T7>,
      ISQLOrderByField<T8>,
      ISQLOrderByField<T9>,
      ISQLOrderByField<T10>
    ]
  ): RT;

  (fields: ISQLOrderByField | ISQLOrderByField[]): RT;
}

export type AtomicDataValue = string | number | boolean | Uint8Array | Date;

export interface INamedParameter extends SQLExpression {
  parameterName: string;
}

export type DataValue<
  Ref extends ColumnReferenceFn<any> = ColumnReferenceFn<any>
> = AtomicDataValue | Ref | INamedParameter | null;

export type TableFieldUpdates<T> = {
  [P in keyof T]?: DataValue | SQLExpression;
};

export type ChangesNamedParameters<T> = {
  [P in keyof T]: INamedParameter;
};

export interface ISelectClause extends SQLExpression {
  readonly isDistinct: boolean;
  readonly selectFields: SQLExpression[];
}

export interface IFromClause extends SQLExpression {
  readonly tables: ResultSet<any>[];
  readonly joins: readonly IJoin[];
}

export interface IWhereClause extends SQLExpression {
  rootWhereExpression: SQLExpression;
}

export type ReferencableTable<T> =
  | ReferencedTable<T>
  | TableDefinition<T>
  | IDBTable<T>;

export type SelectQryTablePrm<T> = ReferencableTable<T> | ResultSet<T>;

export interface IQryCallback {
  <T>(qry: SelectQuery<T>, t1: T): void;

  <T1, T2>(qry: SelectQuery<T1 & T2>, t1: T1, t2: T2): void;

  <T1, T2, T3>(qry: SelectQuery<T1 & T2 & T3>, t1: T1, t2: T2, t3: T3): void;

  <T1, T2, T3, T4>(
    qry: SelectQuery<T1 & T2 & T3 & T4>,
    t1: T1,
    t2: T2,
    t3: T3,
    t4: T4
  ): void;

  <T1, T2, T3, T4, T5>(
    qry: SelectQuery<T1 & T2 & T3 & T4>,
    t1: T1,
    t2: T2,
    t3: T3,
    t4: T4,
    t5: T5
  ): void;
}

export type SelectFields<ObjShape = any> = Array<
  ResultColumn<ObjShape> | SQLExpression | ReferencedTable<ObjShape>
>;

export type SelectFieldPrm<ObjShape> =
  | ColumnReferenceFn<ObjShape>
  | SQLExpression
  | ReferencedTable<ObjShape>;

export interface IFieldsMemberFn<ReturnType> {
  <T>(field: SelectFieldPrm<T>): ReturnType;

  <T1, T2>(fields: [SelectFieldPrm<T1>, SelectFieldPrm<T2>]): ReturnType;

  <T1, T2, T3>(
    fields: [SelectFieldPrm<T1>, SelectFieldPrm<T2>, SelectFieldPrm<T3>]
  ): ReturnType;

  <T1, T2, T3, T4>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>
    ]
  ): ReturnType;

  <T1, T2, T3, T4, T5>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>,
      SelectFieldPrm<T5>
    ]
  ): ReturnType;

  <T1, T2, T3, T4, T5, T6>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>,
      SelectFieldPrm<T5>,
      SelectFieldPrm<T6>
    ]
  ): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>,
      SelectFieldPrm<T5>,
      SelectFieldPrm<T6>,
      SelectFieldPrm<T7>,
      SelectFieldPrm<T8>
    ]
  ): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>,
      SelectFieldPrm<T5>,
      SelectFieldPrm<T6>,
      SelectFieldPrm<T7>,
      SelectFieldPrm<T8>,
      SelectFieldPrm<T9>
    ]
  ): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
    fields: [
      SelectFieldPrm<T1>,
      SelectFieldPrm<T2>,
      SelectFieldPrm<T3>,
      SelectFieldPrm<T4>,
      SelectFieldPrm<T5>,
      SelectFieldPrm<T6>,
      SelectFieldPrm<T7>,
      SelectFieldPrm<T8>,
      SelectFieldPrm<T9>,
      SelectFieldPrm<T10>
    ]
  ): ReturnType;

  (fields: SelectFieldPrm<any>[]): ReturnType;
}

export type ColumnsNames<ObjShape> = {
  [P in keyof ObjShape]: P;
};

/**
 * Represents a SQL select query and allows manipulating it before generating
 * its string representation. The Select query can use joins, tables,
 * subqueries.
 *
 * The union operator is at this stage not supported.
 */
export interface SelectQuery<ObjShape = any> extends ResultSet<ObjShape> {
  /**
   * Allows working on the select query object itself with all
   * the tables in the fields member field passed as parameters as
   * well. Used in the selectFrom function.
   *
   * @param cb
   */
  executeCallback: (cb: IQryCallback) => void;

  /**
   * Lists all the fields we are explicitly selecting for the query.
   * If no field is selected, all fields of all the involved tables will be returned.
   */
  fields: IFieldsMemberFn<SelectQuery<ObjShape>>;

  /**
   * Allows ordering the query results on a number of fields, each one in asc or
   * desc order
   */
  orderBy: IOrderByFn<SelectQuery<ObjShape>>;

  /**
   * Allows adding two or more joined tables to the list of tables we select from.
   *
   * @param p1
   * @param p2
   * @param p3
   * @param p4
   * @param p5
   */
  join: <T1, T2>(
    p1: ColumnReferenceFn<T1> | SQLExpression,
    p2: ColumnReferenceFn<T1 | T2> | SQLExpression,
    p3?: JoinType | ColumnReferenceFn<T1 | T2> | SQLExpression,
    p4?: JoinType | ColumnReferenceFn<T2>,
    p5?: JoinType
  ) => SelectQuery<ObjShape>;

  /**
   * Sets the root where condition for the statement.
   *
   * @param rootCond
   */
  where: (rootCond: SQLExpression) => SelectQuery<ObjShape>;

  /**
   * If the database dialect supports it, you can limit the number of rows returned
   * (e.g. limit in postgres, rownum in oracle, top in sql server...)
   *
   * Returns the query object itself to allow chaining of conditions
   */
  maxRows: (maxRows: number) => SelectQuery<ObjShape>;

  /**
   * If the parameter is true, makes the selct statement a select distinct one.
   *
   * @param {number} boolean
   * @returns {SelectQuery<ObjShape>}
   */
  selectDistinct: (isSelectDistinct: boolean) => SelectQuery<ObjShape>;
}

export const MAX_SINGLE_LINE_STATEMENT_LENGTH = 72;

export interface IFieldSelectSqlExpression<T = any>
  extends SQLAliasedExpression {
  field: TableFieldReference<T> | CalculatedFieldReference<T>;
}

export interface ISqlNullValueExpression {
  val1: SQLExpression;
  val2: SQLExpression;
}
