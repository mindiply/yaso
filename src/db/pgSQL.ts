import {
  BinaryOperatorExpression,
  FormattedSqlValueExpression,
  QueryContext,
  rawSql,
  value
} from '../query/SQLExpression';
import {IDBDialect, setDbDialect} from './index';
import {ISelectStatement} from '../query/statements';
import {IFieldReference, IQueryContext, ISQLExpression} from '../dbTypes';
import {DataValue, MAX_SINGLE_LINE_STATEMENT_LENGTH} from '../query/types';
import indentString from 'indent-string';
import {parenthesizeSql} from '../query/utils';

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
  expressions: ISQLExpression[];
}

class CoalesceSqlExpression<LeftTableDef = any>
  implements ICoalesceSqlExpression {
  public expressions: ISQLExpression[];

  constructor(...expressions: Array<DataValue<LeftTableDef> | ISQLExpression>) {
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
  public encryptField = (value: ISQLExpression): ISQLExpression =>
    new FormattedSqlValueExpression(encryptFormatFn, value);

  public decryptField = (expression: ISQLExpression): ISQLExpression =>
    new FormattedSqlValueExpression(decryptFormatFn, expression);

  public hashField = (expression: ISQLExpression): ISQLExpression =>
    new FormattedSqlValueExpression(hashFormatFn, expression);

  public hashPwField = (expression: ISQLExpression): ISQLExpression =>
    new FormattedSqlValueExpression(hashPwFormatFn, expression);

  public hashPwFieldVal = <T>(
    valueExpression: ISQLExpression,
    fieldRef?: IFieldReference<T>
  ): ISQLExpression => {
    if (!fieldRef) return valueExpression;
    return new FormattedSqlValueExpression(hashPwValFormatFn, [
      valueExpression,
      fieldRef
    ]);
  };

  public namedParameter = (prmName: string): string => `$[${prmName}]`;

  public now = () => rawSql('current_timestamp');

  toSelectSql = (selectStatement: ISelectStatement): ISelectStatement => {
    if (selectStatement.maxReturnRows && selectStatement.maxReturnRows > 0) {
      selectStatement.addClause(
        'limitBy',
        rawSql(`limit ${selectStatement.maxReturnRows}`)
      );
    }
    return selectStatement;
  };

  nullValue = <LeftTableDef = any, RightTableDef = any>(
    val1: ISQLExpression | DataValue<LeftTableDef>,
    val2: ISQLExpression | DataValue<RightTableDef>
  ): ISQLExpression =>
    new CoalesceSqlExpression(val1, val2 as DataValue<LeftTableDef>);

  concat = <LeftTableDef = any, RightTableDef = any>(
    v1: ISQLExpression | DataValue<LeftTableDef>,
    v2: ISQLExpression | DataValue<LeftTableDef>
  ) => new BinaryOperatorExpression(v1, '||', v2);
}

export const usePg = () => {
  setDbDialect(new PgDialect());
};
