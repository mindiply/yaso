import {FormattedSqlValueExpression, rawSql} from '../query/SQLExpression';
import {IFieldReference, ISQLExpression} from '../query/types';
import {IDBDialect, setDbDialect} from './index';
import {ISelectStatement} from '../query/statements';

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
    if (selectStatement.maxRows && selectStatement.maxRows > 0) {
      selectStatement.addClause(
        'limitBy',
        rawSql(`limit ${selectStatement.maxRows}`)
      );
    }
    return selectStatement;
  };
}

export const usePg = () => {
  setDbDialect(new PgDialect());
};
