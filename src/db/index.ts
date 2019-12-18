import {IFieldReference, ISQLExpression} from '../query/types';
import {SQLValue} from '../query/SQLExpression';

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
}

class NoDialect implements IDBDialect {
  decryptField = (expression: ISQLExpression): ISQLExpression => expression;
  encryptField = (expression: ISQLExpression): ISQLExpression => expression;
  hashField = (expression: ISQLExpression): ISQLExpression => expression;
  hashPwField = (expression: ISQLExpression): ISQLExpression => expression;
  hashPwFieldVal = (valueExpression: ISQLExpression): ISQLExpression =>
    valueExpression;
  now = () => new SQLValue('now');
  namedParameter = (name: string) => name;
}

let currentDialect: IDBDialect = new NoDialect();

export const dbDialect = (): IDBDialect => currentDialect;

export const setDbDialect = (newDialect: IDBDialect) => {
  currentDialect = newDialect;
};
