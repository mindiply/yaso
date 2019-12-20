import {Id} from './utils';
import {IDBField, IDBTable} from '../dbModel';

/**
 * the .toSql function signature (or any toXXXSql function), which
 * accepts an optional query context object to determine the alias
 * of the table the sql expression belongs to.
 */
export interface IToSqlFn {
  (qryContext?: IQueryContext): string;
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
}

export type ReferencedTable<T> = {
  [P in keyof Required<T>]: IFieldReferenceFn<T[P]>;
} &
  IFromTable<T>;

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
   * It returns the alias assigned to a specific refernced table object,
   * using the === operator to find it.
   * @param tbl
   */
  tableRefAlias: <T>(tbl: ReferencedTable<T>) => null | string;
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

export interface ISqlAggregateOperator extends ISQLExpression {
  expression: ISQLExpression;
  operator: AggregateOperator;
}

export interface ISqlListExpression extends ISQLExpression {
  listItems: ISQLExpression[];
}

/**
 * Represents a reference to a specific field of a referenced
 * table within a query.
 *
 * The field can be used in different types of statements and how
 * it should be represented in sql changes.
 */
export interface IFieldReference<T = any> extends ISQLExpression {
  /**
   * If the field has been aliased that alias is returned, otherwise
   * the database name of the field
   */
  readonly alias: string;
  field: IDBField<T>;
  qryTbl: ReferencedTable<T>;
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

export type IFieldReferenceFn<T = any> = (
  newAlias?: string
) => IFieldReference<T>;

export interface ISQLOrderByField<T = any> {
  field: ISQLExpression | IFieldReferenceFn<T>;
  isDesc?: boolean;
}

export interface ISQLOrderByExpression extends ISQLExpression {
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

export interface IOrderByFn<RT = ISQLOrderByExpression> {
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

export type DataValue =
  | AtomicDataValue
  | IFieldReferenceFn<string>
  | IFieldReferenceFn<number>
  | IFieldReferenceFn<boolean>
  | IFieldReferenceFn<Date>
  | IFieldReferenceFn<Uint8Array>
  | IFieldReferenceFn<Id>
  | IFieldReferenceFn<AtomicDataValue>
  | INamedParameter;
export type TableFieldUpdates<T> = {
  [P in keyof T]?: DataValue | ISQLExpression;
};

export interface ISelectClause extends ISQLExpression {
  selectFields: ISQLExpression[];
}

export interface IFromClause extends ISQLExpression {
  tables: IFromTable<any>[];
  joins: IJoin[];
}
