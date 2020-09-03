import {
  BinaryOperatorExpression,
  caseWhen,
  value
} from '../query/SQLExpression';
import {ISelectStatement} from '../query/statements';
import {TableFieldReference, SQLExpression} from '../dbTypes';
import {DataValue} from '../query/types';

/**
 * An IDBDialect object provides functions that specialize the
 * SQL syntax to a specific database engine (and potentially client library)
 */
export interface IDBDialect {
  decryptField: (expression: SQLExpression) => SQLExpression;
  encryptField: (expression: SQLExpression) => SQLExpression;
  hashField: (expression: SQLExpression) => SQLExpression;
  hashPwField: (expression: SQLExpression) => SQLExpression;
  hashPwFieldVal: <T>(
    valueExpression: SQLExpression,
    fieldRef?: TableFieldReference<T>
  ) => SQLExpression;
  now: () => SQLExpression;
  namedParameter: (parameterName: string) => string;

  /**
   * The null value expression (nvl in oracle, coalesce in postgres)
   * allows returning a second sql expression if the first one
   * evaluates to null
   *
   * @param val1
   * @param val2
   */
  nullValue: (
    val1: DataValue | SQLExpression,
    val2: DataValue | SQLExpression
  ) => SQLExpression;

  /**
   * Given a select statement in input, allows to manipulate it
   * in order to inject dialect specific syntax in the statement.
   *
   * The statement object returned may be a new object or the
   * same one provided in input.
   *
   * @param selectStatement
   */
  toSelectSql: (selectStatement: ISelectStatement) => ISelectStatement;

  /**
   * String concatenation operator
   *
   * @param {DataValue | SQLExpression} val1
   * @param {DataValue | SQLExpression} val2
   * @returns {SQLExpression}
   */
  concat: (
    val1: DataValue | SQLExpression,
    val2: DataValue | SQLExpression
  ) => SQLExpression;
}

class NoDialect implements IDBDialect {
  decryptField = (expression: SQLExpression): SQLExpression => expression;
  encryptField = (expression: SQLExpression): SQLExpression => expression;
  hashField = (expression: SQLExpression): SQLExpression => expression;
  hashPwField = (expression: SQLExpression): SQLExpression => expression;
  hashPwFieldVal = (valueExpression: SQLExpression): SQLExpression =>
    valueExpression;
  now = () => value('now');
  namedParameter = (name: string) => name;
  toSelectSql = (selectStatement: ISelectStatement): ISelectStatement =>
    selectStatement;
  concat = (v1: SQLExpression | DataValue, v2: SQLExpression | DataValue) =>
    new BinaryOperatorExpression(v1, '||', v2);
  nullValue = (
    val1: SQLExpression | DataValue,
    val2: SQLExpression | DataValue
  ): SQLExpression => caseWhen([{condition: val1, then: val1}], val2);
}

let currentDialect: IDBDialect = new NoDialect();

export const dbDialect = (): IDBDialect => currentDialect;

export const setDbDialect = (newDialect: IDBDialect) => {
  currentDialect = newDialect;
};
