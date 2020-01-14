import {caseWhen, value} from '../query/SQLExpression';
import {ISelectStatement} from '../query/statements';
import {IFieldReference, ISQLExpression} from '../dbTypes';
import {DataValue} from '../query/types';

/**
 * An IDBDialect object provides functions that specialize the
 * SQL syntax to a specific database engine (and potentially client library)
 */
export interface IDBDialect {
  decryptField: (expression: ISQLExpression) => ISQLExpression;
  encryptField: (expression: ISQLExpression) => ISQLExpression;
  hashField: (expression: ISQLExpression) => ISQLExpression;
  hashPwField: (expression: ISQLExpression) => ISQLExpression;
  hashPwFieldVal: <T>(
    valueExpression: ISQLExpression,
    fieldRef?: IFieldReference<T>
  ) => ISQLExpression;
  now: () => ISQLExpression;
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
    val1: DataValue | ISQLExpression,
    val2: DataValue | ISQLExpression
  ) => ISQLExpression;

  /**
   * Given a select statement in input, allows to manipulate it
   * in order to inject dialect specific syntax in the statement.
   *
   * The statement object returned may or may not be different from the
   * one provided in input.
   *
   * @param selectStatement
   */
  toSelectSql: (selectStatement: ISelectStatement) => ISelectStatement;
}

class NoDialect implements IDBDialect {
  decryptField = (expression: ISQLExpression): ISQLExpression => expression;
  encryptField = (expression: ISQLExpression): ISQLExpression => expression;
  hashField = (expression: ISQLExpression): ISQLExpression => expression;
  hashPwField = (expression: ISQLExpression): ISQLExpression => expression;
  hashPwFieldVal = (valueExpression: ISQLExpression): ISQLExpression =>
    valueExpression;
  now = () => value('now');
  namedParameter = (name: string) => name;
  toSelectSql = (selectStatement: ISelectStatement): ISelectStatement =>
    selectStatement;
  nullValue = (
    val1: ISQLExpression | DataValue,
    val2: ISQLExpression | DataValue
  ): ISQLExpression => caseWhen([{condition: val1, then: val1}], val2);
}

let currentDialect: IDBDialect = new NoDialect();

export const dbDialect = (): IDBDialect => currentDialect;

export const setDbDialect = (newDialect: IDBDialect) => {
  currentDialect = newDialect;
};
