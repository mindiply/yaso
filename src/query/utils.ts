import indentString from 'indent-string';
import {ITableFieldDefinition} from '../dbTypes';

export const countNLines = (value: string): number =>
  String(value).split(/\r\n|\r|\n/).length;

export const parenthesizeSql = (sqlStr: string): string => {
  const nLines = countNLines(sqlStr);
  return `(${nLines > 1 ? '\n' : ''}${
    nLines > 1 ? indentString(sqlStr, 2) : sqlStr
  }${nLines > 1 ? '\n' : ''})`;
};

export type Id = string | number;

export interface IId {
  _id: Id;
}

export interface ITbl extends IId {
  cc: number;
  createdAt: Date;
  updatedAt: Date;
}

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
