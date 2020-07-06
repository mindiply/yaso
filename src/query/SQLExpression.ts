import {countNLines, infixString, parenthesizeSql} from './utils';
import indentString from 'indent-string';
import {
  AggregateOperator,
  BinaryComparator,
  DataValue,
  IFromClause,
  IInNotInStatement,
  IJoin,
  INamedParameter,
  InNotInOperator,
  IOrderByFn,
  ISelectClause,
  ISqlAggregateOperator,
  ISqlAliasExpression,
  ISqlBinaryComparison,
  ISqlListExpression,
  ISqlLogicalExpression,
  ISQLMathExpression,
  IOrderByClause,
  ISQLOrderByField,
  IWhereClause,
  IWhereNullCond,
  JoinType,
  LogicalOperator,
  MathBinaryOperator,
  NullComparatorType,
  TableFieldUpdates,
  MAX_SINGLE_LINE_STATEMENT_LENGTH,
  ISqlCaseExpression,
  ISqlCaseBranch,
  ISelectQry
} from './types';
import {
  FieldReference,
  isCalculateFieldReference,
  isFieldReference,
  isFieldSelectSqlExpression
} from './sqlTableFieldReference';
import {dbDialect} from '../db';
import {
  IFieldReferenceFn,
  IFromTable,
  IQueryContext,
  ISQLExpression,
  ReferencedTable
} from '../dbTypes';

type SQLTableFieldUpdates<T> = {
  [P in keyof T]?: ISQLExpression;
};

export class NullExpression implements ISQLExpression {
  isSimpleValue = () => true;

  toSql = () => 'NULL';
}

export const sqlNull = () => new NullExpression();

export class AliasSqlExpression implements ISqlAliasExpression {
  protected readonly _alias: string;
  public expression: ISQLExpression;

  constructor(expression: ISQLExpression, alias: string) {
    this.expression = expression;
    this._alias = alias;
  }

  public get alias() {
    return this._alias;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) =>
    `${
      this.expression.isSimpleValue()
        ? this.expression.toSql(qryContext)
        : parenthesizeSql(this.expression.toSql(qryContext))
    } as "${this._alias}"`;
}

export const alias = (expression: ISQLExpression, alias: string) =>
  new AliasSqlExpression(expression, alias);

export class NamedParameter implements INamedParameter {
  public parameterName: string;

  constructor(parameterName: string) {
    this.parameterName = parameterName;
  }

  public isSimpleValue = () => true;

  public toSql = (): string => dbDialect().namedParameter(this.parameterName);
}

interface IDbTableAliasesMapEntry<T> {
  counter: number;
  aliases: Array<[ReferencedTable<T>, string]>;
}

export class QueryContext implements IQueryContext {
  private aliases: Set<string>;
  private tables: Map<string, IDbTableAliasesMapEntry<any>>;
  private counter: number;

  constructor() {
    this.aliases = new Set();
    this.tables = new Map();
    this.counter = 1;
  }

  protected addTableRef = <T>(
    tableRef: ReferencedTable<T>,
    alias: string,
    counter = 0
  ) => {
    this.aliases.add(alias);
    const dbTblMap = this.tables.get(tableRef.tbl.dbName) || {
      counter,
      aliases: []
    };
    dbTblMap.counter = counter;
    dbTblMap.aliases.push([tableRef as ReferencedTable<any>, alias]);
    this.tables.set(tableRef.tbl.dbName, dbTblMap);
  };

  protected getAliasCounter<T>(tbl: ReferencedTable<T>): number {
    const tblDbName = tbl.tbl.dbName;
    const tableEntry = this.tables.get(tblDbName);
    return tableEntry ? tableEntry.counter : 0;
  }

  public addTable = <T>(tbl: ReferencedTable<T>): string => {
    if (tbl.alias) {
      if (this.aliases.has(tbl.alias)) {
        throw new Error('Explicit alias is already user');
      }
      this.addTableRef(tbl, tbl.alias);
      return tbl.alias;
    }
    const counter = this.getAliasCounter(tbl);
    const tblAlias = `${tbl.tbl.dbName}${
      counter > 0 ? String(counter + 1) : ''
    }`;
    this.addTableRef(tbl, tblAlias, counter + 1);
    return tblAlias;
  };

  public tableRefAlias = <T>(tblRef: ReferencedTable<T>): null | string => {
    const tableAliases = this.tables.get(tblRef.tbl.dbName);
    if (!tableAliases) return null;
    for (const [ref, alias] of tableAliases.aliases) {
      if (ref === tblRef) return alias;
    }
    return null;
  };
}

class SQLValue<TableDef = any> implements ISQLExpression {
  protected readonly value: DataValue<TableDef>;
  constructor(data: DataValue<TableDef>) {
    this.value = data;
  }

  public isSimpleValue = (): boolean => {
    if (
      typeof this.value === 'number' ||
      typeof this.value === 'string' ||
      typeof this.value === 'boolean' ||
      this.value instanceof Date ||
      typeof this.value === 'function' ||
      this.value instanceof FieldReference ||
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
      return value.toISOString();
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (value instanceof FieldReference) {
      return value.toSelectSql().toSql(qryContext);
    }
    if (isCalculateFieldReference(value)) {
      return value.toSelectSql().toSql(qryContext);
    }
    if (typeof value === 'function') {
      return (value as IFieldReferenceFn)().toSql(qryContext);
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

export function value<TableDef = any>(
  value: DataValue<TableDef> | ISQLExpression
): ISQLExpression {
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
      : new SQLValue(fieldValue as DataValue<T>);
  });
  return sqlChanges;
};

export function prm(name: string): NamedParameter {
  return new NamedParameter(name);
}

export class BinaryOperatorExpression<
  OperatorType extends string = string,
  LeftTableDef = any,
  RightTableDef = any
> implements ISQLExpression {
  public left: ISQLExpression;
  public operator: OperatorType;
  public right: ISQLExpression;

  constructor(
    left: DataValue<LeftTableDef> | ISQLExpression,
    operator: OperatorType,
    right: DataValue<RightTableDef> | ISQLExpression
  ) {
    this.left = isSqlExpression(left)
      ? left
      : new SQLValue(left as DataValue<LeftTableDef>);
    this.right = isSqlExpression(right)
      ? right
      : new SQLValue(right as DataValue<RightTableDef>);
    this.operator = operator;
  }

  public isSimpleValue = () =>
    Boolean(this.left.isSimpleValue() && this.right.isSimpleValue());

  public toSql = (qryContext: IQueryContext = new QueryContext()): string =>
    infixString(qryContext, this.left, this.operator as string, this.right);
}

export class RawSQL implements ISQLExpression {
  protected readonly rawSql: string;
  protected readonly _isSimpleValue: boolean;
  constructor(rawSql: string, isSimpleValue?: boolean) {
    this.rawSql = rawSql;
    this._isSimpleValue = Boolean(isSimpleValue || false);
  }

  public toSql = () => this.rawSql;

  public isSimpleValue = () => this._isSimpleValue;
}

export const rawSql = (rawSql: string, isSimpleValue = false): RawSQL => {
  return new RawSQL(rawSql, isSimpleValue);
};

export const add = <LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.add, right);
};

export const sub = <LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.subtract, right);
};

export const mul = <LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.multiply, right);
};

export const div = <LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.divide, right);
};

export const mod = <LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISQLMathExpression => {
  return new BinaryOperatorExpression(left, MathBinaryOperator.modulo, right);
};

class IsNullWhereCond<TableDef = any> implements IWhereNullCond {
  public operand: ISQLExpression;
  public type: NullComparatorType;

  constructor(
    operand: ISQLExpression | DataValue<TableDef>,
    type = NullComparatorType.isNull
  ) {
    this.operand = isSqlExpression(operand)
      ? operand
      : new SQLValue(operand as DataValue<TableDef>);
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

export function isNull<TableDef = any>(
  field: ISQLExpression | DataValue<TableDef>
) {
  return new IsNullWhereCond(field, NullComparatorType.isNull);
}

export function isNotNull<TableDef = any>(
  field: ISQLExpression | DataValue<TableDef>
) {
  return new IsNullWhereCond(field, NullComparatorType.isNotNull);
}

export class LogicalOperatorCond implements ISqlLogicalExpression {
  public operator: LogicalOperator;
  public operands: ISQLExpression[];

  constructor(
    operator: LogicalOperator,
    operands: ISQLExpression | ISQLExpression[]
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

export function equals<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.equals, right);
}

export function moreThan<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.moreThan, right);
}

export function moreOrEqual<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.moreThanOrEqual,
    right
  );
}

export function lessThan<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(left, BinaryComparator.lessThan, right);
}

export function lessOrEqual<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
): ISqlBinaryComparison {
  return new BinaryOperatorExpression(
    left,
    BinaryComparator.lessThanOrEqual,
    right
  );
}

export function diffs<LeftTableDef = any, RightTableDef = any>(
  left: ISQLExpression | DataValue<LeftTableDef>,
  right: ISQLExpression | DataValue<RightTableDef>
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

class SQLAggregateOperator<TableDef = any> implements ISqlAggregateOperator {
  public expression: ISQLExpression;
  public operator: AggregateOperator | string;

  constructor(
    type: AggregateOperator | string,
    expression: ISQLExpression | DataValue<TableDef>
  ) {
    this.operator = type;
    this.expression = isSqlExpression(expression)
      ? expression
      : new SQLValue(expression as DataValue<TableDef>);
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) =>
    `${this.operator}${parenthesizeSql(this.expression.toSql(qryContext))}`;
}

export const aggregateWith = <TableDef = any>(
  aggregatorOperator: string,
  expr: ISQLExpression | DataValue<TableDef>
) => new SQLAggregateOperator(aggregatorOperator, expr);

export const count = <TableDef = any>(
  expr: ISQLExpression | DataValue<TableDef>
) => new SQLAggregateOperator(AggregateOperator.count, expr);

export const min = <TableDef = any>(
  expr: ISQLExpression | DataValue<TableDef>
) => new SQLAggregateOperator(AggregateOperator.min, expr);

export const max = <TableDef = any>(
  expr: ISQLExpression | DataValue<TableDef>
) => new SQLAggregateOperator(AggregateOperator.max, expr);

export const sum = <TableDef = any>(
  expr: ISQLExpression | DataValue<TableDef>
) => new SQLAggregateOperator(AggregateOperator.sum, expr);

class SQLListExpression implements ISqlListExpression {
  public listItems: ISQLExpression[];

  constructor(items: ISQLExpression[]) {
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
      items.join(totChars > MAX_SINGLE_LINE_STATEMENT_LENGTH ? '\n' : ', ')
    );
  };
}

export const list = (
  items: Array<ISQLExpression | DataValue>
): ISqlListExpression => {
  return new SQLListExpression(
    items.map(item =>
      isSqlExpression(item) ? item : new SQLValue(item as DataValue)
    )
  );
};

class InNotInStatement implements IInNotInStatement {
  public type: InNotInOperator;
  public left: ISQLExpression;
  public right: ISqlListExpression | ISelectQry;

  constructor(
    left: ISQLExpression,
    type: InNotInOperator,
    right: ISqlListExpression | ISelectQry
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
  left: ISQLExpression,
  right: ISqlListExpression | ISelectQry
): IInNotInStatement => new InNotInStatement(left, InNotInOperator.in, right);

export const notIn = (
  left: ISQLExpression,
  right: ISqlListExpression | ISelectQry
): IInNotInStatement =>
  new InNotInStatement(left, InNotInOperator.notIn, right);

class SqlOrderByClause implements IOrderByClause {
  public orderByFields: ISQLOrderByField[];

  constructor(fields: ISQLOrderByField | ISQLOrderByField[]) {
    this.orderByFields = Array.isArray(fields) ? fields : [fields];
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) =>
    this.orderByFields.length < 1
      ? ''
      : this.orderByFields.length === 1
      ? `order by ${this.fieldToSql(qryContext, this.orderByFields[0])}`
      : `order by\n${indentString(
          this.orderByFields
            .map(field => this.fieldToSql(qryContext, field))
            .join(',\n'),
          2
        )}`;

  protected fieldToSql = (
    qryContext: IQueryContext,
    {field, isDesc}: ISQLOrderByField
  ): string =>
    `${
      typeof field === 'function'
        ? field().toSql(qryContext)
        : field.isSimpleValue()
        ? field.toSql(qryContext)
        : parenthesizeSql(field.toSql(qryContext))
    }${isDesc ? ' desc' : ''}`;
}

export const orderBy: IOrderByFn = (
  fields: ISQLOrderByField | ISQLOrderByField[]
): IOrderByClause => {
  return new SqlOrderByClause(fields);
};

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

export class Join implements IJoin {
  public type: JoinType;
  public from: IFieldReferenceFn | IJoin;
  public to: IFieldReferenceFn | IJoin;
  public onFrom?: IFieldReferenceFn;
  public onTo?: IFieldReferenceFn;

  constructor(
    p1: IFieldReferenceFn | IJoin,
    p2: IFieldReferenceFn | IJoin,
    p3: JoinType | IFieldReferenceFn | IJoin = JoinType.inner,
    p4?: JoinType | IFieldReferenceFn,
    p5?: JoinType
  ) {
    if (typeof p1 === 'function') {
      this.from = p1;
      if (typeof p2 === 'function') {
        this.to = p2;
        this.type = (p3 as JoinType) || JoinType.inner;
      } else {
        this.to = p2;
        this.onTo = p3 as IFieldReferenceFn;
        this.type = (p4 as JoinType) || JoinType.inner;
      }
    } else {
      this.from = p1;
      this.onFrom = p2 as IFieldReferenceFn;
      if (typeof p3 === 'function') {
        this.to = p3 as IFieldReferenceFn;
        this.type = (p4 as JoinType) || JoinType.inner;
      } else {
        this.to = p3 as IJoin;
        this.onTo = p4 as IFieldReferenceFn;
        this.type = (p5 as JoinType) || JoinType.inner;
      }
    }
  }

  public isSimpleValue = () => false;

  public toSql = (context?: IQueryContext): string => {
    const qryContext = context || new QueryContext();
    if (typeof this.from === 'function') {
      if (typeof this.to === 'function') {
        const fromRef = (this.from as IFieldReferenceFn)();
        const toRef = (this.to as IFieldReferenceFn)();
        if (!context) {
          qryContext.addTable(fromRef.qryTbl);
          qryContext.addTable(toRef.qryTbl);
        }
        const from = fromRef.qryTbl.toSql(qryContext);
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const to = toRef.qryTbl.toSql(qryContext);
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `${from} ${sqlJoinByType(
          this.type
        )} ${to} on ${fromFld} = ${toFld}`;
      } else {
        const fromRef = (this.from as IFieldReferenceFn)();
        const from = fromRef.qryTbl.toSql(qryContext);
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toRef = (this.onTo as IFieldReferenceFn)();
        const toJoin = indentString((this.to as IJoin).toSql(qryContext), 4);
        const toFld = toRef.toReferenceSql().toSql(qryContext);
        return `
${from} ${sqlJoinByType(this.type)} (
  ${toJoin}
) on ${fromFld} = ${toFld}`;
      }
    } else {
      if (typeof this.to === 'function') {
        const fromJoin = indentString(
          (this.from as IJoin).toSql(qryContext),
          4
        );
        const fromRef = (this.onFrom as IFieldReferenceFn)();
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toRef = (this.to as IFieldReferenceFn)();
        if (!context) {
          qryContext.addTable(toRef.qryTbl);
        }
        const to = toRef.qryTbl.toSql(qryContext);
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
        const fromRef = (this.onFrom as IFieldReferenceFn)();
        const fromFld = fromRef.toReferenceSql().toSql(qryContext);
        const toJoin = indentString((this.to as IJoin).toSql(qryContext), 4);
        const toRef = (this.onTo as IFieldReferenceFn)();
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
  onFieldTbl1: IFieldReferenceFn,
  onFieldTbl2: IFieldReferenceFn,
  type: JoinType
): IJoin<T1, T2>;
export function join<T1, T2, T3>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: IFieldReferenceFn,
  onFieldTbl2: IFieldReferenceFn,
  type: JoinType
): IJoin<IJoin<T1, T2>, T3>;
export function join<T1, T2, T3>(
  onFieldTbl1: IFieldReferenceFn,
  existingJoinRight: IJoin<T2, T3>,
  onTo: IFieldReferenceFn,
  type: JoinType
): IJoin<T1, IJoin<T2, T3>>;
export function join<T1, T2, T3, T4>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: IFieldReferenceFn,
  existingJoinRight: IJoin<T3, T4>,
  onTo: IFieldReferenceFn,
  type: JoinType
): IJoin<IJoin<T1, T2>, IJoin<T3, T4>>;
export function join(
  p1: IFieldReferenceFn | IJoin<any, any>,
  p2: IFieldReferenceFn | IJoin<any, any>,
  p3: JoinType | IFieldReferenceFn | IJoin<any, any> = JoinType.inner,
  p4?: JoinType | IFieldReferenceFn,
  p5?: JoinType
): IJoin {
  if (typeof p1 === 'function') {
    if (typeof p2 === 'function') {
      return new Join(p1, p2 as IFieldReferenceFn, p3 as JoinType);
    } else {
      return new Join(
        p1 as IFieldReferenceFn,
        p2 as IJoin,
        p3 as IFieldReferenceFn,
        p4 as JoinType
      );
    }
  } else {
    if (typeof p2 === 'function') {
      return new Join(
        p1,
        p2 as IFieldReferenceFn,
        p3 as IFieldReferenceFn,
        p4 as JoinType
      );
    } else {
      return new Join(
        p1 as IJoin,
        (p2 as any) as IFieldReferenceFn,
        p3 as IJoin,
        p4 as IFieldReferenceFn,
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

export function isSqlExpression(obj: any): obj is ISQLExpression {
  if (typeof obj === 'object') {
    return Boolean(
      typeof obj.toSql === 'function' && typeof obj.isSimpleValue === 'function'
    );
  }
  return false;
}

export class FormattedSqlValueExpression<TableDef = any>
  implements ISQLExpression {
  private encapsulatedValues: ISQLExpression[];
  private readonly formattingFunction: ISqlValueFormattingFunction;

  constructor(
    formattingFunction: ISqlValueFormattingFunction,
    values: ISQLExpression | DataValue<TableDef> | Array<ISQLExpression>
  ) {
    this.formattingFunction = formattingFunction;
    this.encapsulatedValues = Array.isArray(values)
      ? values.map(value =>
          isSqlExpression(value)
            ? value
            : new SQLValue(value as DataValue<TableDef>)
        )
      : [
          isSqlExpression(values)
            ? values
            : new SQLValue(values as DataValue<TableDef>)
        ];
  }

  isSimpleValue = () =>
    this.encapsulatedValues.every(sqlExpression =>
      sqlExpression.isSimpleValue()
    );

  toSql = (qryContext?: IQueryContext): string => {
    const valExpressions = this.encapsulatedValues.map(encapsulatedValue =>
      encapsulatedValue.toSql(qryContext)
    );
    return this.formattingFunction(...valExpressions);
  };
}

class SelectClause implements ISelectClause {
  public selectFields: ISQLExpression[];

  constructor(fields: ISQLExpression[] = []) {
    this.selectFields = fields;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext: IQueryContext = new QueryContext()) => {
    this.selectFields.sort((a, b) => {
      const aAlias =
        isFieldReference(a) || isCalculateFieldReference(a)
          ? a.alias
          : isFieldSelectSqlExpression(a)
          ? a.field.alias
          : 'a';
      const bAlias =
        isFieldReference(b) || isCalculateFieldReference(b)
          ? b.alias
          : isFieldSelectSqlExpression(b)
          ? b.field.alias
          : 'b';
      if ((aAlias || '') < (bAlias || '')) {
        return -1;
      }
      if ((aAlias || '') == (bAlias || '')) {
        return 0;
      }
      return 1;
    });
    const fieldsSql = this.selectFields
      .map(field =>
        isFieldReference(field) || isCalculateFieldReference(field)
          ? field.toSelectSql().toSql(qryContext)
          : field.toSql(qryContext)
      )
      .join(',\n');
    return `select${countNLines(fieldsSql) > 1 ? '\n' : ''}${indentString(
      fieldsSql,
      countNLines(fieldsSql) > 1 ? 2 : 1
    )}`;
  };
}

export const selectClause = (fields?: ISQLExpression[]): ISelectClause =>
  new SelectClause(fields);

export function isSelectClause(obj: any): obj is ISQLExpression {
  return obj && obj instanceof SelectClause ? true : false;
}

function populateJoinTableSet(
  joins: IJoin[],
  tablesSet: Set<IFromTable<any>>
): void {
  for (const join of joins) {
    if (isFieldReference(join.from)) {
      tablesSet.add(join.from.qryTbl);
    }
    if (typeof join.from === 'function') {
      tablesSet.add(join.from().qryTbl);
    }
    if (isJoin(join.from)) {
      populateJoinTableSet([join.from], tablesSet);
    }
    if (isFieldReference(join.to)) {
      tablesSet.add(join.to.qryTbl);
    }
    if (typeof join.to === 'function') {
      tablesSet.add(join.to().qryTbl);
    }
    if (isJoin(join.to)) {
      populateJoinTableSet([join.to], tablesSet);
    }
  }
}

class FromClause implements IFromClause {
  public tables: IFromTable<any>[];
  public joins: IJoin[];

  constructor(tables: IFromTable<any>[] = [], joins: IJoin[] = []) {
    this.tables = tables;
    this.joins = joins;
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    if (this.tables.length === 0 && this.joins.length === 0) {
      return '';
    }
    let fromLines: string[];
    if (this.joins.length > 0) {
      // If there are joins, we need to add additional tables in the this.from
      // member, excluding the tables already referenced in the joins
      fromLines = this.joins.map(fromJoin => fromJoin.toSql(qryContext));
      const tablesToFilter = this.tablesInJoins();
      const fromRemaining = this.tables.filter(
        table => !tablesToFilter.has(table)
      );
      if (fromRemaining.length > 0) {
        fromLines.push(...fromRemaining.map(table => table.toSql(qryContext)));
      }
    } else {
      fromLines = this.tables.map(table => table.toSql(qryContext));
    }
    const tablesSql = fromLines.join(',\n');
    return `from${
      countNLines(tablesSql) > 1
        ? `\n${indentString(tablesSql, 2)}`
        : ` ${tablesSql}`
    }`;
  };

  private tablesInJoins = (): Set<IFromTable<any>> => {
    const tablesSet: Set<IFromTable<any>> = new Set();
    populateJoinTableSet(this.joins, tablesSet);
    return tablesSet;
  };
}

export const fromClause = (
  tables: IFromTable<any>[] = [],
  joins: IJoin[] = []
): IFromClause => new FromClause(tables, joins);

class WhereClause implements IWhereClause {
  public rootWhereExpression: ISQLExpression;

  constructor(rootWhereExpression: ISQLExpression) {
    this.rootWhereExpression = rootWhereExpression;
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    const whereSql = this.rootWhereExpression.toSql(qryContext);
    return `where${countNLines(whereSql) > 1 ? '\n' : ''}${indentString(
      whereSql,
      countNLines(whereSql) > 1 ? 2 : 1
    )}`;
  };
}

export const whereClause = (
  rootWhereExpression: ISQLExpression
): IWhereClause => {
  return new WhereClause(rootWhereExpression);
};

class CaseExpression<CondTableDef = any, ThenTableDef = any, ElseTableDef = any>
  implements ISqlCaseExpression {
  public whenBranches: ISqlCaseBranch[];
  public elseVal?: ISQLExpression;

  constructor(
    whenBranches: Array<{
      condition: ISQLExpression | DataValue<CondTableDef>;
      then: ISQLExpression | DataValue<ThenTableDef>;
    }>,
    elseVal?: ISQLExpression | DataValue<ElseTableDef>
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
    lines.push('end');
    const caseLen =
      lines.reduce((totLen, line) => totLen + line.length, 0) +
      lines.length -
      1;
    if (caseLen < MAX_SINGLE_LINE_STATEMENT_LENGTH) {
      return lines.join(' ');
    }
    lines.pop();
    lines.unshift();
    return `case\n${indentString(lines.join('\n'), 2)}\nend`;
  };
}

export function caseWhen<
  CondTableDef = any,
  ThenTableDef = any,
  ElseTableDef = any
>(
  whenBranches: Array<{
    condition: ISQLExpression | DataValue<CondTableDef>;
    then: ISQLExpression | DataValue<ThenTableDef>;
  }>,
  elseVal?: ISQLExpression | DataValue<ElseTableDef>
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
export function nullValue<LeftTableDef = any, RightTableDef = any>(
  val1: ISQLExpression | DataValue<LeftTableDef>,
  val2: ISQLExpression | DataValue<RightTableDef>
): ISQLExpression {
  return dbDialect().nullValue(val1, val2);
}

export function concat<LeftTableDef = any, RightTableDef = any>(
  val1: ISQLExpression | DataValue<LeftTableDef>,
  val2: ISQLExpression | DataValue<RightTableDef>
): ISQLExpression {
  return dbDialect().concat(val1, val2);
}

class ParenthesizedExpression implements ISQLExpression {
  private expression: ISQLExpression;

  constructor(value: ISQLExpression) {
    this.expression = value;
  }

  public isSimpleValue = () => this.expression.isSimpleValue();

  public toSql = (qryContext?: IQueryContext) => {
    return parenthesizeSql(
      this.expression.toSql(qryContext || new QueryContext())
    );
  };
}

/**
 * Wraps a sql expression in parenthesis
 * @param sqlExpression
 */
export const parenthesized = (sqlExpression: ISQLExpression): ISQLExpression =>
  new ParenthesizedExpression(sqlExpression);

export const binaryOperator = <
  Operator extends string = string,
  LeftTableDef = any,
  RightTableDef = any
>(
  val1: ISQLExpression | DataValue<LeftTableDef>,
  operator: Operator,
  val2: ISQLExpression | DataValue<RightTableDef>
): ISQLExpression => new BinaryOperatorExpression(val1, operator, val2);
