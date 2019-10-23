import indentString from 'indent-string';

export const countNLines = (value: string): number =>
  String(value).split(/\r\n|\r|\n/).length;

export const parenthesizeSql = (sqlStr: string): string => {
  const nLines = countNLines(sqlStr);
  return `(${nLines > 1 ? '\n' : ''}${indentString(
    sqlStr,
    nLines > 1 ? 2 : 0
  )}${nLines > 1 ? '\n' : ''})`;
};
