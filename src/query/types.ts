import {
  ICalculatedFieldReference,
  IDBTable,
  IFieldReference,
  IFieldReferenceFn,
  IFromTable,
  ISQLExpression,
  ReferencedTable
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

export interface ISqlAliasExpression extends ISQLExpression {
  expression: ISQLExpression;
}

export interface ISQLMathExpression extends ISQLExpression {
  left: ISQLExpression;
  right: ISQLExpression;
  operator: MathBinaryOperator;
}

export enum NullComparatorType {
  isNull = 'isNull',
  isNotNull = 'isNotNull'
}

export interface IWhereNullCond extends ISQLExpression {
  operand: ISQLExpression;
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

export interface ISqlBinaryComparison extends ISQLExpression {
  left: ISQLExpression;
  right: ISQLExpression;
  operator: BinaryComparator;
}

export interface ISqlLogicalExpression extends ISQLExpression {
  operator: LogicalOperator;
  operands: ISQLExpression | ISQLExpression[];
}

export enum AggregateOperator {
  count = 'count',
  min = 'min',
  max = 'max',
  sum = 'sum'
}

export interface ISqlCaseBranch {
  condition: ISQLExpression;
  then: ISQLExpression;
}

export interface ISqlCaseExpression extends ISQLExpression {
  whenBranches: ISqlCaseBranch[];
  elseVal?: ISQLExpression;
}

export interface ISqlAggregateOperator extends ISQLExpression {
  expression: ISQLExpression;
  operator: AggregateOperator | string;
}

export interface ISqlListExpression extends ISQLExpression {
  listItems: ISQLExpression[];
}

export interface ISQLOrderByField<T = any> {
  field: ISQLExpression | IFieldReferenceFn<T>;
  isDesc?: boolean;
}

export interface IOrderByClause extends ISQLExpression {
  orderByFields: ISQLOrderByField[];
}

export enum InNotInOperator {
  in = 'in',
  notIn = 'not in'
}

export interface IInNotInStatement {
  type: InNotInOperator;
  left: ISQLExpression;
  right: ISQLExpression;
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
  extends ISQLExpression {
  type: JoinType;
  from: IFieldReferenceFn | IJoin<T1, T2>;
  to: IFieldReferenceFn | IJoin<T2, T3> | IJoin<T3, T4>;
  onFrom?: IFieldReferenceFn;
  onTo?: IFieldReferenceFn;
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

export interface INamedParameter extends ISQLExpression {
  parameterName: string;
}

export type DataValue<TableDefinition = any> =
  | AtomicDataValue
  | IFieldReferenceFn<TableDefinition>
  | INamedParameter
  | null;

export type TableFieldUpdates<T> = {
  [P in keyof T]?: DataValue<T> | ISQLExpression;
};

export interface ISelectClause extends ISQLExpression {
  selectFields: ISQLExpression[];
}

export interface IFromClause extends ISQLExpression {
  tables: IFromTable<any>[];
  joins: IJoin[];
}

export interface IWhereClause extends ISQLExpression {
  rootWhereExpression: ISQLExpression;
}

export type SelectQryTablePrm<T> = IDBTable<T> | ReferencedTable<T>;

export interface IQryCallback {
  <T>(qry: ISelectQry, t1: T): void;

  <T1, T2>(qry: ISelectQry, t1: T1, t2: T2): void;

  <T1, T2, T3>(qry: ISelectQry, t1: T1, t2: T2, t3: T3): void;

  <T1, T2, T3, T4>(qry: ISelectQry, t1: T1, t2: T2, t3: T3, t4: T4): void;

  <T1, T2, T3, T4, T5>(
    qry: ISelectQry,
    t1: T1,
    t2: T2,
    t3: T3,
    t4: T4,
    t5: T5
  ): void;
}

export type SelectFields = Array<
  IFieldReference | ISQLExpression | ReferencedTable<any>
>;
export type SelectFieldPrm<T> =
  | IFieldReferenceFn<T>
  | ISQLExpression
  | ReferencedTable<T>;

export interface IFieldsMemberFn<ReturnType> {
  <T>(field: SelectFieldPrm<T>): ReturnType;

  <T1, T2>([field1, field2]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>
  ]): ReturnType;

  <T1, T2, T3>([field1, field2, field3]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>
  ]): ReturnType;

  <T1, T2, T3, T4>([field1, field2, field3, field4]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>
  ]): ReturnType;

  <T1, T2, T3, T4, T5>([field1, field2, field3, field4, field5]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6>([field1, field2, field3, field4, field5, field6]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8
  ]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>,
    SelectFieldPrm<T7>,
    SelectFieldPrm<T8>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8,
    field9
  ]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>,
    SelectFieldPrm<T7>,
    SelectFieldPrm<T8>,
    SelectFieldPrm<T9>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8,
    field9,
    field10
  ]: [
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
  ]): ReturnType;

  (fields: SelectFieldPrm<any>[]): ReturnType;
}

/**
 * Represents a SQL select query and allows manipulating it before generating
 * its string representation. The Select query can use joins, tables,
 * subqueries.
 *
 * The union operator is at this stage not supported.
 */
export interface ISelectQry extends ISQLExpression {
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
  fields: IFieldsMemberFn<ISelectQry>;

  /**
   * Allows ordering the query results on a number of fields, each one in asc or
   * desc order
   */
  orderBy: IOrderByFn<ISelectQry>;

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
    p1: IFieldReferenceFn | ISQLExpression,
    p2: IFieldReferenceFn | ISQLExpression,
    p3?: JoinType | IFieldReferenceFn | ISQLExpression,
    p4?: JoinType | IFieldReferenceFn,
    p5?: JoinType
  ) => ISelectQry;

  /**
   * Sets the root where condition for the statement.
   *
   * @param rootCond
   */
  where: (rootCond: ISQLExpression) => ISelectQry;

  /**
   * If the database dialect supports it, you can limit the number of rows returned
   * (e.g. limit in postgres, rownum in oracle, top in sql server...)
   *
   * Returns the query object itself to allow chaining of conditions
   */
  maxRows: (maxRows: number) => ISelectQry;
}

export const MAX_SINGLE_LINE_STATEMENT_LENGTH = 72;

export interface IFieldSelectSqlExpression<T = any> extends ISQLExpression {
  field: IFieldReference<T> | ICalculatedFieldReference<T>;
}

export interface ISqlNullValueExpression {
  val1: ISQLExpression;
  val2: ISQLExpression;
}

/**
 * Utility mapped type for table definitions, that normalizes a table definition,
 * including the calculated fields definitions
 */
export type ResolvedTableDef<TableDef> = {
  [P in keyof TableDef]: TableDef[P] extends (...args: any[]) => infer R
    ? R
    : TableDef[P];
};
