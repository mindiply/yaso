import indentString from 'indent-string';

export const countNLines = (value: string): number =>
  String(value).split(/\r\n|\r|\n/).length;

export const parenthesizeSql = (sqlStr: string): string => {
  const nLines = countNLines(sqlStr);
  return `(${nLines > 1 ? '\n' : ''}${
    nLines > 1 ? indentString(sqlStr, 2) : sqlStr
  }${nLines > 1 ? '\n' : ''})`;
};
