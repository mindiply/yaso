import {FieldReference, IFieldReferenceFn} from './sqlFieldReference';
import {parenthesizeSql} from './utils';
import {TableFieldUpdates} from './sqlTableQuery';
import {IQueryContext} from './sqlQuery';

export interface ISQLExpression {
  alias: string | undefined;
  toSql: () => string;
  isSimpleValue: () => boolean;
  queryContext?: IQueryContext;
}

export interface INamedParameter extends ISQLExpression {
  parameterName: string;
}

type SQLTableFieldUpdates<T> = {
  [P in keyof T]?: ISQLExpression;
};

let _prm: (name: string) => string = name => name;
export function prmToSql(name: string) {
  return _prm(name);
}

export abstract class BaseSqlExpression implements ISQLExpression {
  protected root?: ISQLExpression;
  protected _queryContext?: IQueryContext;

  get alias(): string | undefined {
    return undefined;
  }

  isSimpleValue: () => boolean = () => false;

  toSql = () => '';

  set queryContext(context: IQueryContext | undefined) {
    this._queryContext = context;
  }

  get queryContext(): IQueryContext | undefined {
    return this._queryContext;
  }

  protected constructor(root?: ISQLExpression) {
    if (root) {
      this.root = root;
    }
  }
}

export interface ISqlAliasExpression extends ISQLExpression {
  expression: ISQLExpression;
}

export class AliasSqlExpression extends BaseSqlExpression
  implements ISqlAliasExpression {
  protected readonly _alias: string;
  public expression: ISQLExpression;

  constructor(
    expression: ISQLExpression,
    alias: string,
    context?: IQueryContext
  ) {
    super();
    this.expression = expression;
    this._alias = alias;
    if (context) {
      this.queryContext = context;
    }
  }

  public get alias() {
    return this._alias;
  }

  public isSimpleValue = () => true;

  public toSql = () =>
    `${
      this.expression.isSimpleValue()
        ? this.expression.toSql()
        : parenthesizeSql(this.expression.toSql())
    } as "${this._alias}"`;

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.expression.queryContext = context;
  }
}

export const alias = (expression: ISQLExpression, alias: string) =>
  new AliasSqlExpression(expression, alias);

export class NamedParameter extends BaseSqlExpression
  implements INamedParameter {
  public parameterName: string;

  constructor(parameterName: string) {
    super();
    this.parameterName = parameterName;
  }

  public isSimpleValue = () => true;

  public toSql = () => prmToSql(this.parameterName);
}

export class SQLValue extends BaseSqlExpression implements ISQLExpression {
  protected readonly value: DataValue;
  constructor(data: DataValue) {
    super();
    this.value = data;
  }

  public isSimpleValue = (): boolean => {
    if (
      typeof this.value === 'number' ||
      typeof this.value === 'string' ||
      typeof this.value === 'boolean' ||
      this.value instanceof Date ||
      typeof this.value === 'function' ||
      this.value instanceof FieldReference
    ) {
      return true;
    }
    if (this.value instanceof Uint8Array) {
      return true;
    }
    return false;
  };

  public toSql = () => {
    const {value} = this;
    if (value instanceof NamedParameter) {
      return value.toSql();
    }
    if (value instanceof Uint8Array) {
      return `\\x${Buffer.from(value).toString('hex')}`;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value instanceof FieldReference) {
      return value.toSelectSql();
    }
    if (typeof value === 'function') {
      return (value as IFieldReferenceFn)().toSql();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return `'${String(value)}'`;
  };
}

export const transformFieldUpdatesToSql = <T>(
  changes: TableFieldUpdates<T>
): SQLTableFieldUpdates<T> => {
  const sqlChanges: SQLTableFieldUpdates<T> = {};
  Object.entries(changes).forEach(([fieldName, fieldValue]) => {
    sqlChanges[fieldName as keyof T] =
      fieldValue instanceof BaseSqlExpression
        ? fieldValue
        : fieldValue === undefined
        ? undefined
        : new SQLValue(fieldValue as DataValue);
  });
  return sqlChanges;
};

export type DataValue =
  | string
  | number
  | boolean
  | Uint8Array
  | Date
  | IFieldReferenceFn
  | INamedParameter;

export function prm(name: string): NamedParameter {
  return new NamedParameter(name);
}

export function setPrmFunction(prmFn: (name: string) => string) {
  _prm = prmFn;
}

enum MathBinaryOperator {
  add = '+',
  subtract = '-',
  multiply = '*',
  divide = '/',
  modulo = '%'
}

export interface ISQLMathExpression extends ISQLExpression {
  left: ISQLExpression;
  right: ISQLExpression;
  operator: MathBinaryOperator;
}

export class SQLMathBinaryExpression extends BaseSqlExpression
  implements ISQLMathExpression {
  public readonly left: ISQLExpression;
  public readonly right: ISQLExpression;
  public readonly operator: MathBinaryOperator;

  constructor(
    operator: MathBinaryOperator,
    left: DataValue | ISQLExpression,
    right: DataValue | ISQLExpression
  ) {
    super();
    this.left =
      left instanceof BaseSqlExpression
        ? left
        : new SQLValue(left as DataValue);
    this.right =
      right instanceof BaseSqlExpression
        ? right
        : new SQLValue(right as DataValue);
    this.operator = operator;
  }

  public isSimpleValue = () => {
    if (this.left.isSimpleValue() && this.right.isSimpleValue()) {
      return true;
    }
    return false;
  };

  public toSql = () =>
    `${
      this.left.isSimpleValue()
        ? this.left.toSql()
        : parenthesizeSql(this.left.toSql())
    } ${this.operator} ${
      this.right.isSimpleValue()
        ? this.right.toSql()
        : parenthesizeSql(this.right.toSql())
    }`;

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.left.queryContext = context;
    this.right.queryContext = context;
  }
}

class RawSQL extends BaseSqlExpression {
  protected readonly rawSql: string;
  protected readonly _isSimpleValue: boolean;
  constructor(rawSql: string, isSimpleValue?: boolean) {
    super();
    this.rawSql = rawSql;
    this._isSimpleValue = Boolean(isSimpleValue || false);
  }

  public toSql = () => this.rawSql;

  public isSimpleValue = () => this._isSimpleValue;
}

export const rawSql = (rawSql: string, isSimpleValue = false): RawSQL => {
  return new RawSQL(rawSql, isSimpleValue);
};

export const add = (
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): SQLMathBinaryExpression => {
  return new SQLMathBinaryExpression(MathBinaryOperator.add, left, right);
};

export const sub = (
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): SQLMathBinaryExpression => {
  return new SQLMathBinaryExpression(MathBinaryOperator.subtract, left, right);
};

export const mul = (
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): SQLMathBinaryExpression => {
  return new SQLMathBinaryExpression(MathBinaryOperator.multiply, left, right);
};

export const div = (
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): SQLMathBinaryExpression => {
  return new SQLMathBinaryExpression(MathBinaryOperator.divide, left, right);
};

export const mod = (
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): SQLMathBinaryExpression => {
  return new SQLMathBinaryExpression(MathBinaryOperator.modulo, left, right);
};

export interface IWhereNullCond extends ISQLExpression {
  operand: ISQLExpression;
  type: NullComparatorType;
}

export enum NullComparatorType {
  isNull = 'isNull',
  isNotNull = 'isNotNull'
}

class IsNullWhereCond extends BaseSqlExpression implements IWhereNullCond {
  public operand: ISQLExpression;
  public type: NullComparatorType;

  constructor(
    operand: ISQLExpression | DataValue,
    type = NullComparatorType.isNull
  ) {
    super();
    this.operand =
      operand instanceof BaseSqlExpression
        ? operand
        : new SQLValue(operand as DataValue);
    this.type = type;
  }

  public isSimpleValue = () => this.operand.isSimpleValue();

  public toSql = () => {
    return `${
      this.operand.isSimpleValue()
        ? this.operand.toSql()
        : parenthesizeSql(this.operand.toSql())
    } ${this.type === NullComparatorType.isNull ? 'is null' : 'is not null'}`;
  };

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.operand.queryContext = context;
  }
}

export function isNull(field: ISQLExpression | DataValue) {
  return new IsNullWhereCond(field, NullComparatorType.isNull);
}

export function isNotNull(field: ISQLExpression | DataValue) {
  return new IsNullWhereCond(field, NullComparatorType.isNotNull);
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

export class BinaryOperatorExpression extends BaseSqlExpression
  implements ISqlBinaryComparison {
  public left: ISQLExpression;
  public operator: BinaryComparator;
  public right: ISQLExpression;

  constructor(
    left: DataValue | ISQLExpression,
    operator: BinaryComparator,
    right: DataValue | ISQLExpression
  ) {
    super();
    this.left =
      left instanceof BaseSqlExpression
        ? left
        : new SQLValue(left as DataValue);
    this.operator = operator;
    this.right =
      right instanceof BaseSqlExpression
        ? right
        : new SQLValue(right as DataValue);
  }

  public isSimpleValue = () =>
    Boolean(this.left.isSimpleValue() && this.right.isSimpleValue());

  public toSql = (): string => {
    const left = this.left.isSimpleValue()
      ? this.left.toSql()
      : parenthesizeSql(this.left.toSql());
    const right = this.right.isSimpleValue()
      ? this.right.toSql()
      : parenthesizeSql(this.right.toSql());
    return `${left} ${this.operator} ${right}`;
  };

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.left.queryContext = context;
    this.right.queryContext = context;
  }
}

export interface ISqlLogicalExpression extends ISQLExpression {
  operator: LogicalOperator;
  operands: ISQLExpression | ISQLExpression[];
}

export class LogicalOperatorCond extends BaseSqlExpression
  implements ISqlLogicalExpression {
  public operator: LogicalOperator;
  public operands: ISQLExpression[];

  constructor(
    operator: LogicalOperator,
    operands: ISQLExpression | ISQLExpression[]
  ) {
    super();
    this.operator = operator;
    this.operands = Array.isArray(operands) ? operands : [operands];
    if (this.operands.length < 1) {
      throw new Error('Creating a logical operator without conditions');
    }
  }

  public toSql = () => {
    if (this.operator === LogicalOperator.NOT) {
      const operandSql = this.operands[0].toSql();
      return `not ${parenthesizeSql(operandSql)}`;
    }
    return this.operands
      .map(operand =>
        operand.isSimpleValue()
          ? operand.toSql()
          : parenthesizeSql(operand.toSql())
      )
      .join(`\n${this.operator} `);
  };

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.operands.forEach(operand => (operand.queryContext = context));
  }
}

export function equals(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.equals, right);
}

export function moreThan(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.moreThan, right);
}

export function moreOrEqual(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.moreThanOrEqual,
    right
  );
}

export function lessThan(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.lessThan, right);
}

export function lessOrEqual(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.lessThanOrEqual,
    right
  );
}

export function diffs(
  left: ISQLExpression | DataValue,
  right: ISQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.diffs, right);
}

export function and(operands: ISQLExpression[]) {
  return new LogicalOperatorCond(LogicalOperator.AND, operands);
}

export function or(operands: ISQLExpression[]) {
  return new LogicalOperatorCond(LogicalOperator.OR, operands);
}

export function not(operand: ISQLExpression) {
  return new LogicalOperatorCond(LogicalOperator.NOT, operand);
}

export enum AggregateOperator {
  count = 'count',
  min = 'min',
  max = 'max',
  sum = 'sum'
}

export interface ISqlAggregateOperator {
  expression: ISQLExpression;
  operator: AggregateOperator;
}

class SQLAggregateOperator extends BaseSqlExpression
  implements ISqlAggregateOperator {
  public expression: ISQLExpression;
  public operator: AggregateOperator;

  constructor(type: AggregateOperator, expression: ISQLExpression | DataValue) {
    super();
    this.operator = type;
    this.expression =
      expression instanceof BaseSqlExpression
        ? expression
        : new SQLValue(expression as DataValue);
  }

  public isSimpleValue = () => true;

  public toSql = () =>
    `${this.operator}${parenthesizeSql(this.expression.toSql())}`;

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.expression.queryContext = context;
  }
}

export const count = (expr: ISQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.count, expr);

export const min = (expr: ISQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.min, expr);

export const max = (expr: ISQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.max, expr);

export const sum = (expr: ISQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.sum, expr);

interface ISqlListExpression extends ISQLExpression {
  listItems: ISQLExpression[];
}

class SQLListExpression extends BaseSqlExpression
  implements ISqlListExpression {
  public listItems: ISQLExpression[];

  constructor(items: ISQLExpression[]) {
    super();
    this.listItems = items;
  }

  public isSimpleValue = () => true;

  public toSql = () =>
    parenthesizeSql(this.listItems.map(item => item.toSql()).join(', '));

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.listItems.forEach(operand => (operand.queryContext = context));
  }
}

export const list = (
  items: Array<ISQLExpression | DataValue>
): ISqlListExpression => {
  return new SQLListExpression(
    items.map(item =>
      item instanceof BaseSqlExpression ? item : new SQLValue(item as DataValue)
    )
  );
};

export enum InNotInOperator {
  in = 'in',
  notIn = 'not in'
}

export interface IInNotInStatement {
  type: InNotInOperator;
  left: ISQLExpression;
  right: ISQLExpression;
}

class InNotInStatement extends BaseSqlExpression implements IInNotInStatement {
  public type: InNotInOperator;
  public left: ISQLExpression;
  public right: ISQLExpression;

  constructor(
    left: ISQLExpression,
    type: InNotInOperator,
    right: ISQLExpression
  ) {
    super();
    this.type = type;
    this.left = left;
    this.right = right;
  }

  public toSql = () =>
    `${
      this.left.isSimpleValue()
        ? this.left.toSql()
        : parenthesizeSql(this.left.toSql())
    } ${this.type} ${
      this.right.isSimpleValue
        ? this.right.toSql()
        : parenthesizeSql(this.right.toSql())
    }`;

  set queryContext(context: IQueryContext) {
    super.queryContext = context;
    this.left.queryContext = context;
    this.right.queryContext = context;
  }
}

export const sqlIn = (
  left: ISQLExpression,
  right: ISqlListExpression
): IInNotInStatement => new InNotInStatement(left, InNotInOperator.in, right);

export const notIn = (
  left: ISQLExpression,
  right: ISqlListExpression
): IInNotInStatement =>
  new InNotInStatement(left, InNotInOperator.notIn, right);
