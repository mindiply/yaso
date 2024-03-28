import {BinaryOperatorExpression, value} from '../query/SQLExpression';
import {IDBDialect, setDbDialect} from './index';
import {ISelectStatement} from '../query/statements';
import {TableFieldReference, IQueryContext, SQLExpression} from '../dbTypes';
import {DataValue, MAX_SINGLE_LINE_STATEMENT_LENGTH} from '../query/types';
import indentString from 'indent-string';
import {parenthesizeSql} from '../query/utils';
import {QueryContext} from '../query/queryContext';
import {FormattedSqlValueExpression, rawSql} from '../query/BaseSqlExpressions';

const encryptFormatFn = (fldText = '') =>
  `encode(pgp_sym_encrypt(${fldText}, $[encryptionKey]), 'hex')`;

const decryptFormatFn = (fldText = ''): string =>
  `case when ${fldText} is not null then pgp_sym_decrypt(decode(${fldText}, 'hex'), $[encryptionKey]) else null end`;

const hashFormatFn = (fldText = ''): string =>
  `encode(digest(${fldText}, 'sha256'), 'hex')`;

const hashPwFormatFn = (fldText = ''): string =>
  `crypt(${fldText}, gen_salt('md5'))`;

const hashPwValFormatFn = (fldText = '', fldRefText = '') =>
  `crypt(${fldText}, ${fldRefText})`;

interface ICoalesceSqlExpression {
  expressions: SQLExpression[];
}

class CoalesceSqlExpression implements ICoalesceSqlExpression {
  public expressions: SQLExpression[];

  constructor(...expressions: Array<DataValue | SQLExpression>) {
    this.expressions = expressions.map(expression => value(expression));
  }

  isSimpleValue = () => {
    return this.expressions.every(expression => expression.isSimpleValue());
  };

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    if (this.expressions.length < 2) return '';
    const values = this.expressions.map(expression =>
      expression.isSimpleValue()
        ? expression.toSql(qryContext)
        : parenthesizeSql(expression.toSql(qryContext))
    );
    if (
      values.reduce((totChars, valueLine) => totChars + valueLine.length, 0) +
        10 +
        2 * (values.length - 1) <
      MAX_SINGLE_LINE_STATEMENT_LENGTH
    ) {
      return `coalesce(${values.join(', ')})`;
    }
    return `coalesce(\n${indentString(values.join(',\n'), 2)}\n)`;
  };
}

export class PgDialect implements IDBDialect {
  public encryptField = (value: SQLExpression): SQLExpression =>
    new FormattedSqlValueExpression(encryptFormatFn, value);

  public decryptField = (expression: SQLExpression): SQLExpression =>
    new FormattedSqlValueExpression(decryptFormatFn, expression);

  public hashField = (expression: SQLExpression): SQLExpression =>
    new FormattedSqlValueExpression(hashFormatFn, expression);

  public hashPwField = (expression: SQLExpression): SQLExpression =>
    new FormattedSqlValueExpression(hashPwFormatFn, expression);

  public hashPwFieldVal = <T>(
    valueExpression: SQLExpression,
    fieldRef?: TableFieldReference<T>
  ): SQLExpression => {
    if (!fieldRef) return valueExpression;
    return new FormattedSqlValueExpression(hashPwValFormatFn, [
      valueExpression,
      fieldRef
    ]);
  };

  public namedParameter = (prmName: string): string => `$[${prmName}]`;

  public now = () => rawSql('current_timestamp', true);

  toSelectSql = (selectStatement: ISelectStatement): ISelectStatement => {
    if (selectStatement.maxReturnRows && selectStatement.maxReturnRows > 0) {
      selectStatement.addClause(
        'limitBy',
        rawSql(`limit ${selectStatement.maxReturnRows}`)
      );
    }
    return selectStatement;
  };

  nullValue = (
    val1: SQLExpression | DataValue,
    val2: SQLExpression | DataValue
  ): SQLExpression => new CoalesceSqlExpression(val1, val2 as DataValue);

  concat = (v1: SQLExpression | DataValue, v2: SQLExpression | DataValue) =>
    new BinaryOperatorExpression(v1, '||', v2);
}

export const usePg = () => {
  setDbDialect(new PgDialect());
};
