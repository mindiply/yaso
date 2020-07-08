import indentString from 'indent-string';
import {IQueryContext, ISQLExpression, ITableFieldDefinition} from '../dbTypes';
import {ITbl, MAX_SINGLE_LINE_STATEMENT_LENGTH} from './types';

export const countNLines = (value: string): number =>
  String(value).split(/\r\n|\r|\n/).length;

export const parenthesizeSql = (sqlStr: string): string => {
  const nLines = countNLines(sqlStr);
  const doBreak =
    nLines > 1 ||
    (nLines === 0 && sqlStr.length + 2 > MAX_SINGLE_LINE_STATEMENT_LENGTH);
  return `(${doBreak ? '\n' : ''}${doBreak ? indentString(sqlStr, 2) : sqlStr}${
    doBreak ? '\n' : ''
  })`;
};

export function firstLineLength(text: string): number {
  const nLines = countNLines(text);
  if (nLines === 0) return 0;
  if (nLines === 1) return text.length;
  const lines = text.split(/\r\n|\r|\n/);
  return lines[0].length;
}

export function lastLineLength(text: string): number {
  const nLines = countNLines(text);
  if (nLines === 0) return 0;
  if (nLines === 1) return text.length;
  const lines = text.split(/\r\n|\r|\n/);
  return lines[lines.length - 1].length;
}

export const unaryOperatorString = (
  qryContext: IQueryContext,
  expression: ISQLExpression,
  operator: string,
  isLeftOperator = true,
  parenthesizeExpression = true
): string => {
  const opLen = operator.length + 1;
  const expressionSql = parenthesizeExpression
    ? parenthesizeSql(expression.toSql(qryContext))
    : expression.toSql(qryContext);
  const expressionLen = isLeftOperator
    ? firstLineLength(expressionSql)
    : lastLineLength(expressionSql);
  if (opLen + expressionLen <= MAX_SINGLE_LINE_STATEMENT_LENGTH) {
    return isLeftOperator
      ? `${operator} ${expressionSql}`
      : `${expressionSql} ${operator}`;
  }
  return isLeftOperator
    ? `${operator}\n${expressionSql}`
    : `${expressionSql}\n${operator}`;
};

/**
 * Creates a string for the a binary infix operator that breaks down the
 * expression with newlines if the combination of characters is too long.
 *
 * @param qryContext
 * @param left
 * @param infixOperator
 * @param right
 */
export const infixString = (
  qryContext: IQueryContext,
  left: ISQLExpression,
  infixOperator: string,
  right: ISQLExpression
): string => {
  const leftSql = left.isSimpleValue()
    ? left.toSql(qryContext)
    : parenthesizeSql(left.toSql(qryContext));
  const leftLen = lastLineLength(leftSql);
  const rightSql = right.isSimpleValue()
    ? right.toSql(qryContext)
    : parenthesizeSql(right.toSql(qryContext));
  const rightLen = firstLineLength(rightSql);
  const opLen = infixOperator.length + 2;
  if (leftLen + rightLen + opLen <= MAX_SINGLE_LINE_STATEMENT_LENGTH) {
    return `${leftSql} ${infixOperator} ${rightSql}`;
  }
  if (leftLen + opLen <= MAX_SINGLE_LINE_STATEMENT_LENGTH) {
    return `${leftSql} ${infixOperator}\n${indentString(rightSql, 2)}`;
  }

  if (opLen + rightLen <= MAX_SINGLE_LINE_STATEMENT_LENGTH) {
    return `${leftSql}\n${infixOperator} ${rightSql}`;
  }
  return `${leftSql}\n${infixOperator}\n${rightSql}`;
};

export const tblCCFields = <T extends ITbl>(
  tbl: string
): ITableFieldDefinition<T>[] => {
  return [
    {
      dbName: `${tbl}_cc`,
      name: 'cc',
      isCC: true
    },
    {
      dbName: `${tbl}_created_at`,
      name: 'createdAt',
      isInsertTimestamp: true
    },
    {
      dbName: `${tbl}_updated_at`,
      name: 'updatedAt',
      isUpdateTimestamp: true
    }
  ];
};
