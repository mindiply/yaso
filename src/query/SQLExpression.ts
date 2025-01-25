import {
  firstLineLength,
  infixString,
  lastLineLength,
  parenthesizeSql,
  unaryOperatorString
} from './utils';
import indentString from 'indent-string';
import {
  AggregateOperator,
  BinaryComparator,
  ChangesNamedParameters,
  DataValue,
  IInNotInStatement,
  IJoin,
  INamedParameter,
  InNotInOperator,
  ISqlAggregateOperator,
  ISqlAliasExpression,
  ISqlBinaryComparison,
  ISqlCaseBranch,
  ISqlCaseExpression,
  ISqlListExpression,
  ISqlLogicalExpression,
  ISQLMathExpression,
  IWhereNullCond,
  JoinType,
  LogicalOperator,
  MathBinaryOperator,
  MAX_SINGLE_LINE_STATEMENT_LENGTH,
  NullComparatorType,
  SQLFunctionCall,
  TableFieldUpdates
} from './types';
import {
  isCalculateFieldReference,
  isTableFieldReference
} from './sqlTableFieldReference';
import {dbDialect} from '../db';
import {
  ColumnReferenceFn,
  IDBField,
  IQueryContext,
  ResultColumn,
  ResultSet,
  SQLAliasedExpression,
  SQLExpression
} from '../dbTypes';
import {QueryContext} from './queryContext';
import {isSqlExpression} from './BaseSqlExpressions';

type SQLTableFieldUpdates<T> = {
  [P in keyof T]?: SQLExpression;
};

export class NullExpression implements SQLExpression {
  isSimpleValue = () => true;

  toSql = () => 'NULL';
}

export const sqlNull = () => new NullExpression();

export class AliasSqlExpression implements ISqlAliasExpression {
  private _alias: string;
  public expression: SQLExpression;

  constructor(expression: SQLExpression, alias: string) {
    this.expression = expression;
    this._alias = alias;
  }

  public get aliasingFor() {
    return this.expression;
  }

  public get alias() {
    return this._alias;
  }

  public set alias(updatedAlias: string) {
    this._alias = updatedAlias;
  }

  public get isExplicitAlias() {
    return true;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) =>
    `${
      this.expression.isSimpleValue()
        ? this.expression.toSql(qryContext)
        : parenthesizeSql(this.expression.toSql(qryContext))
    } as "${this._alias}"`;
}

export const alias = (expression: SQLExpression, alias: string) =>
  new AliasSqlExpression(expression, alias);

export class NamedParameter implements INamedParameter {
  public parameterName: string;

  constructor(parameterName: string) {
    this.parameterName = parameterName;
  }

  public isSimpleValue = () => true;

  public toSql = (): string => dbDialect().namedParameter(this.parameterName);
}

class SQLValue implements SQLExpression {
  protected readonly value: DataValue;
  constructor(data: DataValue) {
    this.value = data;
  }

  public isSimpleValue = (): boolean => {
    if (isSqlExpression(this.value)) {
      return this.value.isSimpleValue();
    }
    if (
      typeof this.value === 'number' ||
      typeof this.value === 'string' ||
      typeof this.value === 'boolean' ||
      this.value instanceof Date ||
      typeof this.value === 'function' ||
      this.value === null
    ) {
      return true;
    }
    if (this.value instanceof Uint8Array) {
      return true;
    }
    return false;
  };

  public toSql = (qryContext: IQueryContext = new QueryContext()) => {
    const {value} = this;
    if (value instanceof NamedParameter) {
      return value.toSql();
    }
    if (value instanceof Uint8Array) {
      return `\\x${Buffer.from(value).toString('hex')}`;
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (isTableFieldReference(value)) {
      return value.toSelectSql().toSql(qryContext);
    }
    if (isCalculateFieldReference(value)) {
      return value.toSelectSql().toSql(qryContext);
    }
    if (typeof value === 'function') {
      return (value as ColumnReferenceFn<any>)().toSql(qryContext);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value === null) {
      return 'NULL';
    }
    return `'${String(value)}'`;
  };
}

export function value(value: DataValue | SQLExpression): SQLExpression {
  if (isSqlExpression(value)) return value;
  return new SQLValue(value);
}

export const transformFieldUpdatesToSql = <T>(
  changes: TableFieldUpdates<T>
): SQLTableFieldUpdates<T> => {
  const sqlChanges: SQLTableFieldUpdates<T> = {};
  Object.entries(changes).forEach(([fieldName, fieldValue]) => {
    sqlChanges[fieldName as keyof T] = isSqlExpression(fieldValue)
      ? fieldValue
      : fieldValue === undefined
      ? undefined
      : new SQLValue(fieldValue as DataValue);
  });
  return sqlChanges;
};

export function prm(name: string): NamedParameter {
  return new NamedParameter(name);
}

export function changesNamedParameters<T>(
  changes: T
): ChangesNamedParameters<T> {
  const namedParams = {} as ChangesNamedParameters<T>;
  if (changes && typeof changes === 'object') {
    for (const fieldName in changes) {
      namedParams[fieldName] = prm(fieldName);
    }
  }
  return namedParams;
}

export class BinaryOperatorExpression<OperatorType extends string = string>
  implements SQLExpression
{
  public left: SQLExpression;
  public operator: OperatorType;
  public right: SQLExpression;

  constructor(
    left: DataValue | SQLExpression,
    operator: OperatorType,
    right: DataValue | SQLExpression
  ) {
    this.left = isSqlExpression(left) ? left : new SQLValue(left as DataValue);
    this.right = isSqlExpression(right)
      ? right
      : new SQLValue(right as DataValue);
    this.operator = operator;
  }

  public isSimpleValue = () =>
    Boolean(this.left.isSimpleValue() && this.right.isSimpleValue());

  public toSql = (qryContext: IQueryContext = new QueryContext()): string =>
    infixString(qryContext, this.left, this.operator as string, this.right);
}

export const add = (
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.add, right);
};

export const sub = (
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.subtract, right);
};

export const mul = (
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.multiply, right);
};

export const div = (
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.divide, right);
};

export const mod = (
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.modulo, right);
};

class IsNullWhereCond implements IWhereNullCond {
  public operand: SQLExpression;
  public type: NullComparatorType;

  constructor(
    operand: SQLExpression | DataValue,
    type = NullComparatorType.isNull
  ) {
    this.operand = isSqlExpression(operand)
      ? operand
      : new SQLValue(operand as DataValue);
    this.type = type;
  }

  public isSimpleValue = () => this.operand.isSimpleValue();

  public toSql = (qryContext?: IQueryContext) => {
    return `${
      this.operand.isSimpleValue()
        ? this.operand.toSql(qryContext)
        : parenthesizeSql(this.operand.toSql(qryContext))
    } ${this.type === NullComparatorType.isNull ? 'is null' : 'is not null'}`;
  };
}

export function isNull(field: SQLExpression | DataValue) {
  return new IsNullWhereCond(field, NullComparatorType.isNull);
}

export function isNotNull(field: SQLExpression | DataValue) {
  return new IsNullWhereCond(field, NullComparatorType.isNotNull);
}

export class LogicalOperatorCond implements ISqlLogicalExpression {
  public operator: LogicalOperator;
  public operands: SQLExpression[];

  constructor(
    operator: LogicalOperator,
    operands: SQLExpression | SQLExpression[]
  ) {
    this.operator = operator;
    this.operands = Array.isArray(operands) ? operands : [operands];
    if (this.operands.length < 1) {
      throw new Error('Creating a logical operator without conditions');
    }
  }

  public isSimpleValue = () => false;

  public toSql = (qryContext?: IQueryContext) => {
    if (this.operator === LogicalOperator.NOT) {
      const operandSql = this.operands[0].toSql(qryContext);
      return `not ${parenthesizeSql(operandSql)}`;
    }
    return this.operands
      .map(operand =>
        operand.isSimpleValue()
          ? operand.toSql(qryContext)
          : parenthesizeSql(operand.toSql(qryContext))
      )
      .join(`\n${this.operator} `);
  };
}

export function equals(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.equals, right);
}

export function moreThan(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.moreThan, right);
}

export function moreOrEqual(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.moreThanOrEqual,
    right
  );
}

export function lessThan(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.lessThan, right);
}

export function lessOrEqual(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.lessThanOrEqual,
    right
  );
}

export function diffs(
  left: SQLExpression | DataValue,
  right: SQLExpression | DataValue
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.diffs, right);
}

export function and(operands: SQLExpression[]) {
  return new LogicalOperatorCond(LogicalOperator.AND, operands);
}

export function or(operands: SQLExpression[]) {
  return new LogicalOperatorCond(LogicalOperator.OR, operands);
}

export function not(operand: SQLExpression) {
  return new LogicalOperatorCond(LogicalOperator.NOT, operand);
}

class SQLAggregateOperator implements ISqlAggregateOperator {
  public expression: SQLExpression;
  public operator: AggregateOperator | string;

  constructor(
    type: AggregateOperator | string,
    expression: SQLExpression | DataValue
  ) {
    this.operator = type;
    this.expression = isSqlExpression(expression)
      ? expression
      : new SQLValue(expression as DataValue);
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) =>
    `${this.operator}${parenthesizeSql(this.expression.toSql(qryContext))}`;
}

export const aggregateWith = (
  aggregatorOperator: string,
  expr: SQLExpression | DataValue
) => new SQLAggregateOperator(aggregatorOperator, expr);

export const count = (expr: SQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.count, expr);

export const min = (expr: SQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.min, expr);

export const max = (expr: SQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.max, expr);

export const sum = (expr: SQLExpression | DataValue) =>
  new SQLAggregateOperator(AggregateOperator.sum, expr);

class SQLListExpression implements ISqlListExpression {
  public listItems: SQLExpression[];

  constructor(items: SQLExpression[]) {
    this.listItems = items;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) => {
    let totChars = 0;
    const items = this.listItems.map((item, index) => {
      const itemSql = item.toSql(qryContext);
      totChars += itemSql.length + (index > 0 ? 1 : 0);
      return itemSql;
    });
    return parenthesizeSql(
      items.join(totChars > MAX_SINGLE_LINE_STATEMENT_LENGTH ? ',\n' : ', ')
    );
  };
}

export function list(
  items: Array<SQLExpression | DataValue>
): ISqlListExpression;
export function list(
  ...items: Array<SQLExpression | DataValue>
): ISqlListExpression;
export function list(
  first: Array<SQLExpression | DataValue> | SQLExpression | DataValue,
  ...other: Array<SQLExpression | DataValue>
): ISqlListExpression {
  const items = Array.isArray(first) ? first : [first, ...other];
  return new SQLListExpression(
    items.map(item =>
      isSqlExpression(item) ? item : new SQLValue(item as DataValue)
    )
  );
}

class InNotInStatement implements IInNotInStatement {
  public type: InNotInOperator;
  public left: SQLExpression;
  public right: ISqlListExpression | ResultSet<any>;

  constructor(
    left: SQLExpression,
    type: InNotInOperator,
    right: ISqlListExpression | ResultSet<any>
  ) {
    this.type = type;
    this.left = left;
    this.right = right;
  }

  public isSimpleValue = () => false;

  public toSql = (qryContext: IQueryContext = new QueryContext()) =>
    infixString(qryContext, this.left, this.type, this.right);
}

export const sqlIn = (
  left: SQLExpression,
  right: ISqlListExpression | ResultSet<any>
): IInNotInStatement => new InNotInStatement(left, InNotInOperator.in, right);

export const notIn = (
  left: SQLExpression,
  right: ISqlListExpression | ResultSet<any>
): IInNotInStatement =>
  new InNotInStatement(left, InNotInOperator.notIn, right);

const sqlJoinByType = (joinType: JoinType): string => {
  if (joinType === JoinType.inner) {
    return 'join';
  }
  if (joinType === JoinType.leftOuter) {
    return 'left outer join';
  }
  if (joinType === JoinType.rightOuter) {
    return 'right outer join';
  }
  throw new Error(`Unexpected join type: ${joinType}`);
};

export function isResultsetColumn(obj: any): obj is ResultColumn<any> {
  if (obj && typeof obj === 'object') {
    return Boolean(
      obj.alias &&
        typeof obj.alias === 'string' &&
        obj.resultSet &&
        typeof obj.resultSet === 'object' &&
        obj.toSelectSql &&
        typeof obj.toSelectSql === 'function' &&
        obj.toReferenceSql &&
        typeof obj.toReferenceSql === 'function' &&
        isSqlExpression(obj)
    );
  }
  return false;
}

export function isResultsetColumnRefFn(
  obj: any
): obj is ColumnReferenceFn<any> {
  if (obj && typeof obj === 'function') {
    return isResultsetColumn(obj());
  }
  return false;
}

export class Join implements IJoin {
  public type: JoinType;
  public from: ColumnReferenceFn<any> | IJoin;
  public to: ColumnReferenceFn<any> | IJoin;
  public onFrom?: ColumnReferenceFn<any>;
  public onTo?: ColumnReferenceFn<any>;

  constructor(
    p1: ColumnReferenceFn<any> | IJoin,
    p2: ColumnReferenceFn<any> | IJoin,
    p3: JoinType | ColumnReferenceFn<any> | IJoin = JoinType.inner,
    p4?: JoinType | ColumnReferenceFn<any>,
    p5?: JoinType
  ) {
    if (typeof p1 === 'function') {
      this.from = p1;
      if (typeof p2 === 'function') {
        this.to = p2;
        this.type = (p3 as JoinType) || JoinType.inner;
      } else {
        this.to = p2;
        this.onTo = p3 as ColumnReferenceFn<any>;
        this.type = (p4 as JoinType) || JoinType.inner;
      }
    } else {
      this.from = p1;
      this.onFrom = p2 as ColumnReferenceFn<any>;
      if (typeof p3 === 'function') {
        this.to = p3 as ColumnReferenceFn<any>;
        this.type = (p4 as JoinType) || JoinType.inner;
      } else {
        this.to = p3 as IJoin;
        this.onTo = p4 as ColumnReferenceFn<any>;
        this.type = (p5 as JoinType) || JoinType.inner;
      }
    }
  }

  public isSimpleValue = () => false;

  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    if (isResultsetColumnRefFn(this.from)) {
      if (isResultsetColumnRefFn(this.to)) {
        const fromRef = this.from();
        const toRef = this.to();
        const fromTblAlias = qryContext.tableRefAlias(fromRef.resultSet);
        if (!fromTblAlias) {
          qryContext.addTable(fromRef.resultSet);
        }
        const toTblAlias = qryContext.tableRefAlias(toRef.resultSet);
        if (!toTblAlias) {
          qryContext.addTable(toRef.resultSet);
        }
        const from = fromRef.resultSet.toSql(qryContext);
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const to = toRef.resultSet.toSql(qryContext);
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `${from} ${sqlJoinByType(
          this.type
        )} ${to} on ${fromFld} = ${toFld}`;
      } else {
        const fromRef = this.from();
        const from = fromRef.resultSet.toSql(qryContext);
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toRef = (this.onTo as ColumnReferenceFn<any>)();
        const toJoin = indentString((this.to as IJoin).toSql(qryContext), 4);
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `
${from} ${sqlJoinByType(this.type)} (
  ${toJoin}
) on ${fromFld} = ${toFld}`;
      }
    } else {
      if (isResultsetColumnRefFn(this.to)) {
        const fromJoin = indentString(
          (this.from as IJoin).toSql(qryContext),
          4
        );
        const fromRef = (this.onFrom as ColumnReferenceFn<any>)();
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toRef = this.to();
        const toTblAlias = qryContext.tableRefAlias(toRef.resultSet);
        if (!toTblAlias) {
          qryContext.addTable(toRef.resultSet);
        }
        const to = toRef.resultSet.toSql(qryContext);
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `
(
  ${fromJoin}
) ${sqlJoinByType(this.type)} ${to} on ${fromFld} = ${toFld}`;
      } else {
        const fromJoin = indentString(
          (this.from as IJoin).toSql(qryContext),
          4
        );
        const fromRef = (this.onFrom as ColumnReferenceFn<any>)();
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toJoin = indentString((this.to as IJoin).toSql(qryContext), 4);
        const toRef = (this.onTo as ColumnReferenceFn<any>)();
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `
(
  ${fromJoin}
) ${sqlJoinByType(this.type)} (
  ${toJoin}
) on ${fromFld} = ${toFld}`;
      }
    }
  };
}

export function isJoin(obj: any): obj is IJoin {
  if (obj instanceof Join) return true;
  return false;
}

export function join<T1, T2>(
  onFieldTbl1: ColumnReferenceFn<T1>,
  onFieldTbl2: ColumnReferenceFn<T2>,
  type: JoinType
): IJoin<T1, T2>;
export function join<T1, T2, T3>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: ColumnReferenceFn<T1 & T2>,
  onFieldTbl2: ColumnReferenceFn<T3>,
  type: JoinType
): IJoin<IJoin<T1, T2>, T3>;
export function join<T1, T2, T3>(
  onFieldTbl1: ColumnReferenceFn<T1>,
  existingJoinRight: IJoin<T2, T3>,
  onTo: ColumnReferenceFn<T2 & T3>,
  type: JoinType
): IJoin<T1, IJoin<T2, T3>>;
export function join<T1, T2, T3, T4>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: ColumnReferenceFn<T1 & T2>,
  existingJoinRight: IJoin<T3, T4>,
  onTo: ColumnReferenceFn<T3 & T4>,
  type: JoinType
): IJoin<IJoin<T1, T2>, IJoin<T3, T4>>;
export function join(
  p1: ColumnReferenceFn<any> | IJoin<any, any>,
  p2: ColumnReferenceFn<any> | IJoin<any, any>,
  p3: JoinType | ColumnReferenceFn<any> | IJoin<any, any> = JoinType.inner,
  p4?: JoinType | ColumnReferenceFn<any>,
  p5?: JoinType
): IJoin {
  if (typeof p1 === 'function') {
    if (typeof p2 === 'function') {
      return new Join(p1, p2 as ColumnReferenceFn<any>, p3 as JoinType);
    } else {
      return new Join(
        p1 as ColumnReferenceFn<any>,
        p2 as IJoin,
        p3 as ColumnReferenceFn<any>,
        p4 as JoinType
      );
    }
  } else {
    if (typeof p2 === 'function') {
      return new Join(
        p1,
        p2 as ColumnReferenceFn<any>,
        p3 as ColumnReferenceFn<any>,
        p4 as JoinType
      );
    } else {
      return new Join(
        p1 as IJoin,
        p2 as any as ColumnReferenceFn<any>,
        p3 as IJoin,
        p4 as ColumnReferenceFn<any>,
        p5 as JoinType
      );
    }
  }
}

export interface ISqlValueFormattingFunction {
  (valueStr?: string): string;
  (str1: string, str2: string): string;
  (str1: string, str2: string, str3: string): string;
  (str1: string, str2: string, str3: string, str4: string): string;
  (
    str1: string,
    str2: string,
    str3: string,
    str4: string,
    str5: string
  ): string;
  (
    str1: string,
    str2: string,
    str3: string,
    str4: string,
    str5: string,
    str6: string
  ): string;
}

class CaseExpression implements ISqlCaseExpression {
  public whenBranches: ISqlCaseBranch[];
  public elseVal?: SQLExpression;

  constructor(
    whenBranches: Array<{
      condition: SQLExpression | DataValue;
      then: SQLExpression | DataValue;
    }>,
    elseVal?: SQLExpression | DataValue
  ) {
    this.whenBranches = whenBranches.map(({condition, then}) => ({
      condition: isSqlExpression(condition)
        ? condition
        : new SQLValue(condition),
      then: isSqlExpression(then) ? then : new SQLValue(then)
    }));
    this.elseVal = elseVal
      ? isSqlExpression(elseVal)
        ? elseVal
        : new SQLValue(elseVal)
      : undefined;
  }

  isSimpleValue = () => false;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    if (this.whenBranches.length < 1) return '';
    const lines: string[] = ['case'];
    this.whenBranches.forEach(({condition, then}) => {
      lines.push(
        `when ${condition.toSql(qryContext)} then ${then.toSql(qryContext)}`
      );
    });
    if (this.elseVal) {
      lines.push(`else ${this.elseVal.toSql(qryContext)}`);
    }
    lines.push('end');
    const caseLen =
      lines.reduce((totLen, line) => totLen + line.length, 0) +
      lines.length -
      1;
    if (caseLen < MAX_SINGLE_LINE_STATEMENT_LENGTH) {
      return lines.join(' ');
    }
    lines.pop();
    lines.shift();
    return `case\n${indentString(lines.join('\n'), 2)}\nend`;
  };
}

export function caseWhen(
  whenBranches: Array<{
    condition: SQLExpression | DataValue;
    then: SQLExpression | DataValue;
  }>,
  elseVal?: SQLExpression | DataValue
): ISqlCaseExpression {
  return new CaseExpression(whenBranches, elseVal);
}

/**
 * Represents a sql expression that returns value 1 if
 * it does not evaluate to null, and val 2 otherwise.
 *
 * It returns different syntax based on the database dialect
 * in use
 *
 * @param val1
 * @param val2
 */
export function nullValue(
  val1: SQLExpression | DataValue,
  val2: SQLExpression | DataValue
): SQLExpression {
  return dbDialect().nullValue(val1, val2);
}

export function concat(
  val1: SQLExpression | DataValue,
  val2: SQLExpression | DataValue
): SQLExpression {
  return dbDialect().concat(val1, val2);
}

export const binaryOperator = <Operator extends string = string>(
  val1: SQLExpression | DataValue,
  operator: Operator,
  val2: SQLExpression | DataValue
): SQLExpression => new BinaryOperatorExpression(val1, operator, val2);

class ExistsExpression implements SQLExpression {
  private qry: ResultSet<any>;

  constructor(qry: ResultSet<any>) {
    this.qry = qry;
  }

  isSimpleValue = () => false;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    return unaryOperatorString(qryContext, this.qry, 'exists', true, true);
  };
}

/**
 * Allows writing EXISTS (subquery) expressions
 *
 * @param {SelectQuery} qry
 * @returns {SQLExpression}
 */
export const exists = (qry: ResultSet<any>): SQLExpression =>
  new ExistsExpression(qry);

class CastExpression implements SQLExpression {
  private expression: SQLExpression;
  private type: string;

  constructor(expression: DataValue | SQLExpression, type: string) {
    this.expression = isSqlExpression(expression)
      ? expression
      : new SQLValue(expression);
    this.type = type;
  }

  isSimpleValue = () => true;

  toSql = (qryContext?: IQueryContext) => {
    const expressionSql = this.expression.isSimpleValue()
      ? this.expression.toSql(qryContext)
      : parenthesizeSql(this.expression.toSql(qryContext));
    const leftPart = 'cast(';
    const rightPart = ` as ${this.type})`;
    const separator =
      leftPart.length + firstLineLength(expressionSql) >
        MAX_SINGLE_LINE_STATEMENT_LENGTH ||
      rightPart.length + lastLineLength(expressionSql) >
        MAX_SINGLE_LINE_STATEMENT_LENGTH
        ? '\n'
        : '';

    return `${leftPart}${separator}${expressionSql}${separator}${rightPart}`;
  };
}

/**
 * Allows writing CAST (expr AS TYPE) expressions, for casting columns or
 * expressions to specific types
 */
export const castAs = (
  expression: DataValue | SQLExpression,
  type: string
): SQLExpression => new CastExpression(expression, type);

export class AliasedReferenceSql implements SQLExpression {
  private aliasedSql: SQLAliasedExpression;
  private resultSet: ResultSet<any>;

  constructor(resultSet: ResultSet<any>, aliasedSql: SQLAliasedExpression) {
    this.aliasedSql = aliasedSql;
    this.resultSet = resultSet;
  }

  public toSql = () => `"${this.resultSet.alias}"."${this.aliasedSql.alias}"`;

  public isSimpleValue = () => true;
}

class SQLAliasedResultSetCol<ObjShape> implements ResultColumn<ObjShape> {
  public resultSet: ResultSet<ObjShape>;
  private aliasedExpression: SQLAliasedExpression;
  private _dbFieldFn: () => IDBField<ObjShape> | null;

  public constructor(
    resultSet: ResultSet<ObjShape>,
    aliasedExpression: SQLAliasedExpression
  ) {
    this.resultSet = resultSet;
    this.aliasedExpression = aliasedExpression;
    const aliasingFor = aliasedExpression.aliasingFor;
    this._dbFieldFn = isResultsetColumn(aliasingFor)
      ? (aliasingFor.dbField as () => IDBField<ObjShape>)
      : () => null;
  }

  public get isExplicitAlias() {
    return this.aliasedExpression.isExplicitAlias;
  }

  public dbField() {
    return isResultsetColumn(this.aliasingFor)
      ? this.aliasingFor.dbField()
      : null;
  }

  public get aliasingFor() {
    return this.aliasedExpression.aliasingFor;
  }

  public toSelectSql = () => {
    return this.aliasedExpression;
  };

  public toReferenceSql = () =>
    new AliasedReferenceSql(this.resultSet, this.aliasedExpression);

  public toSql = () => this.toReferenceSql().toSql();

  public isSimpleValue = () => true;

  public get alias() {
    return this.aliasedExpression.alias;
  }

  public set alias(newAlias: string) {
    this.aliasedExpression.alias = newAlias;
  }
}

export const createAliasedResultColRef = <ObjShape>(
  resultSet: ResultSet<ObjShape>,
  aliasedExpression: SQLAliasedExpression
): ColumnReferenceFn<ObjShape> => {
  const col: ResultColumn<ObjShape> = new SQLAliasedResultSetCol<ObjShape>(
    resultSet,
    aliasedExpression
  );
  const colRef = () => col;
  colRef.toSql = (qryContext?: IQueryContext) => col.toSql(qryContext);
  colRef.isSimpleValue = () => col.isSimpleValue();
  return colRef;
};

class SQLFunctionCallImpl implements SQLFunctionCall {
  public readonly functionName: string;
  public readonly parameters: SQLExpression[];

  public constructor(functionName: string, parameters: SQLExpression[] = []) {
    this.functionName = functionName;
    this.parameters = parameters;
  }

  public toSql = (qryContext: IQueryContext = new QueryContext()) => {
    let totChars = this.functionName.length + 2;
    const parameters = this.parameters.map((item, index) => {
      const itemSql = item.toSql(qryContext);
      totChars += itemSql.length + (index > 0 ? 1 : 0);
      return itemSql;
    });
    return `${this.functionName}${parenthesizeSql(
      parameters.join(
        totChars > MAX_SINGLE_LINE_STATEMENT_LENGTH ? ',\n' : ', '
      )
    )}`;
  };

  public isSimpleValue = () => true;
}

export function functionCall(
  functionName: string,
  ...prms: Array<SQLExpression | DataValue>
): SQLFunctionCall;
export function functionCall(
  functionName: string,
  prms: Array<SQLExpression | DataValue>
): SQLFunctionCall;
export function functionCall(
  functionName: string,
  first: SQLExpression | DataValue | Array<SQLExpression | DataValue> = [],
  ...other: Array<SQLExpression | DataValue>
): SQLFunctionCall {
  const parameters = Array.isArray(first) ? first : [first, ...other];
  return new SQLFunctionCallImpl(
    functionName,
    parameters.map(parameter =>
      isSqlExpression(parameter) ? parameter : value(parameter)
    )
  );
}
