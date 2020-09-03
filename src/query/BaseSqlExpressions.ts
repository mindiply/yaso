import {
  IQueryContext,
  SQLAliasedExpression,
  SQLExpression,
  TableDefinition
} from '../dbTypes';
import {parenthesizeSql} from './utils';
import {QueryContext} from './queryContext';
import {ISqlValueFormattingFunction} from './SQLExpression';

export class RawSQL implements SQLExpression {
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

class ParenthesizedExpression implements SQLExpression {
  private expression: SQLExpression;

  constructor(value: SQLExpression) {
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
export const parenthesized = (sqlExpression: SQLExpression): SQLExpression =>
  new ParenthesizedExpression(sqlExpression);

export function isSqlExpression(obj: any): obj is SQLExpression {
  if (obj && typeof obj === 'object') {
    return Boolean(
      typeof obj.toSql === 'function' && typeof obj.isSimpleValue === 'function'
    );
  }
  return false;
}

export function isSqlAliasedExpression(obj: any): obj is SQLAliasedExpression {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      obj.alias &&
      typeof obj.alias === 'string' &&
      isSqlExpression(obj)
  );
}

export class FormattedSqlValueExpression implements SQLExpression {
  private encapsulatedValues: SQLExpression[];
  private readonly formattingFunction: ISqlValueFormattingFunction;

  constructor(
    formattingFunction: ISqlValueFormattingFunction,
    values: SQLExpression | Array<SQLExpression>
  ) {
    this.formattingFunction = formattingFunction;
    this.encapsulatedValues = Array.isArray(values) ? values : [values];
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

export function isTableDefinition<T = any>(
  obj: any
): obj is TableDefinition<T> {
  return Boolean(
    obj &&
      typeof obj === 'object' &&
      typeof obj.name === 'string' &&
      typeof obj.dbName === 'string' &&
      Array.isArray(obj.fields) &&
      (typeof obj.calculatedFields === 'undefined' ||
        Array.isArray(obj.calculatedFields))
  );
}
