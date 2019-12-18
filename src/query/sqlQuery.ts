import {IDBTable} from '../dbModel';
import indentString from 'indent-string';
import {BaseSqlExpression, join, orderBy, QueryContext} from './SQLExpression';
import {countNLines, parenthesizeSql} from './utils';
import {tbl} from './sqlTableQuery';
import {
  IFieldReference,
  IFieldReferenceFn,
  IJoin,
  IOrderByFn,
  IQueryContext,
  ISQLExpression,
  ISQLOrderByExpression,
  ISQLOrderByField,
  JoinType,
  ReferencedTable
} from './types';
import {BaseReferenceTable} from './sqlTableFieldReference';

type SelectQryTablePrm<T> = IDBTable<T> | ReferencedTable<T>;
export interface IQryCallback {
  <T>(qry: SelectQry, t1: T): void;
  <T1, T2>(qry: SelectQry, t1: T1, t2: T2): void;
  <T1, T2, T3>(qry: SelectQry, t1: T1, t2: T2, t3: T3): void;
  <T1, T2, T3, T4>(qry: SelectQry, t1: T1, t2: T2, t3: T3, t4: T4): void;
  <T1, T2, T3, T4, T5>(
    qry: SelectQry,
    t1: T1,
    t2: T2,
    t3: T3,
    t4: T4,
    t5: T5
  ): void;
}

type SelectFields = Array<IFieldReference | ISQLExpression>;
type SelectFieldPrm<T> = IFieldReferenceFn<T> | ISQLExpression;

interface IFieldsMemberFn<ReturnType> {
  <T>(field: SelectFieldPrm<T>): ReturnType;
  <T1, T2>([field1, field2]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>
  ]): ReturnType;
  <T1, T2, T3>([field1, field2, field3]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>
  ]): ReturnType;
  <T1, T2, T3, T4>([field1, field2, field3, field4]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>
  ]): ReturnType;
  <T1, T2, T3, T4, T5>([field1, field2, field3, field4, field5]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>
  ]): ReturnType;
  <T1, T2, T3, T4, T5, T6>([field1, field2, field3, field4, field5, field6]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8
  ]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>,
    SelectFieldPrm<T7>,
    SelectFieldPrm<T8>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8,
    field9
  ]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>,
    SelectFieldPrm<T7>,
    SelectFieldPrm<T8>,
    SelectFieldPrm<T9>
  ]): ReturnType;

  <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>([
    field1,
    field2,
    field3,
    field4,
    field5,
    field6,
    field7,
    field8,
    field9,
    field10
  ]: [
    SelectFieldPrm<T1>,
    SelectFieldPrm<T2>,
    SelectFieldPrm<T3>,
    SelectFieldPrm<T4>,
    SelectFieldPrm<T5>,
    SelectFieldPrm<T6>,
    SelectFieldPrm<T7>,
    SelectFieldPrm<T8>,
    SelectFieldPrm<T9>,
    SelectFieldPrm<T10>
  ]): ReturnType;
}

export class SelectQry extends BaseSqlExpression implements ISQLExpression {
  protected from: ReferencedTable<any>[];
  protected selectFields?: SelectFields;
  protected rootWhere?: ISQLExpression;
  protected joins?: IJoin;
  protected orderByExpression?: ISQLOrderByExpression;

  constructor(tables: SelectQryTablePrm<any> | SelectQryTablePrm<any>[]) {
    super();
    if (!tables) {
      throw new Error('Expected at least one table');
    }
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      table instanceof BaseReferenceTable
        ? (table as ReferencedTable<any>)
        : tbl(table as IDBTable)
    );
  }

  public executeCallback = (cb: IQryCallback): void =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    cb(this, ...this.from);

  public fields: IFieldsMemberFn<SelectQry> = (
    fields: SelectFieldPrm<any> | SelectFieldPrm<any>[]
  ): SelectQry => {
    const flds = Array.isArray(fields) ? fields : [fields];
    this.selectFields = flds.map(fld =>
      typeof fld === 'function'
        ? (fld() as IFieldReference)
        : (fld as ISQLExpression)
    );
    return this;
  };

  public orderBy: IOrderByFn<SelectQry> = (
    fields: ISQLOrderByField | ISQLOrderByField[]
  ) => {
    this.orderByExpression = orderBy(fields);
    return this;
  };

  public join = <T1, T2>(
    p1: IFieldReferenceFn<T1> | ISQLExpression,
    p2: IFieldReferenceFn<T1 | T2> | ISQLExpression,
    p3: JoinType | IFieldReferenceFn<T1 | T2> | ISQLExpression = JoinType.inner,
    p4?: JoinType | IFieldReferenceFn<T2>,
    p5?: JoinType
  ): SelectQry => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    this.joins = join(p1, p2!, p3!, p4, p5);
    return this;
  };

  public where = (rootCond: ISQLExpression): SelectQry => {
    this.rootWhere = rootCond;
    return this;
  };

  public toString = (context?: IQueryContext): string => {
    const queryContext = context || new QueryContext();
    this.from.forEach(fromTbl => {
      queryContext.addTable(fromTbl);
    });
    const fromSql = this.fromSql(queryContext);
    const fieldsSql = this.selectFields
      ? this.selectFields
          .map(selectField => {
            return (selectField as IFieldReference).toSelectSql
              ? (selectField as IFieldReference).toSelectSql(queryContext)
              : selectField.isSimpleValue()
              ? selectField.toSql(queryContext)
              : parenthesizeSql(selectField.toSql(queryContext));
          })
          .join(',\n')
      : this.toSelectAllSql(queryContext);
    const whereSql = this.rootWhere
      ? this.rootWhere.toSql(queryContext)
      : undefined;
    const orderBySql = this.orderByExpression
      ? this.orderByExpression.toSql(queryContext)
      : '';
    return `select${countNLines(fieldsSql) > 1 ? '\n' : ''}${indentString(
      fieldsSql,
      countNLines(fieldsSql) > 1 ? 2 : 1
    )}
from${fromSql}${
      whereSql
        ? `
where${countNLines(whereSql) > 1 ? '\n' : ''}${indentString(
            whereSql,
            countNLines(whereSql) > 1 ? 2 : 1
          )}`
        : ''
    }${orderBySql ? `\n${orderBySql}` : ''}`;
  };

  protected toSelectAllSql = (qryContext: IQueryContext) => {
    const fields = Object.values(this.from)
      .map(selectTable =>
        selectTable.tbl.fields.map(field =>
          (selectTable[
            field.name as string
          ] as IFieldReferenceFn)().toSelectSql(qryContext)
        )
      )
      .reduce((allFields, newFields) => allFields.concat(newFields), []);
    return fields.join(',\n');
  };

  protected fromSql = (qryContext: IQueryContext): string => {
    if (this.joins) {
      return this.joins.toSql(qryContext);
    }
    const tables = Object.values(this.from);
    if (tables.length === 1) {
      return ` ${tables[0].toSql(qryContext)}`;
    }
    return (
      '\n' +
      Object.values(this.from)
        .map(qryTbl => indentString(qryTbl.toSql(qryContext), 2))
        .join(',\n')
    );
  };

  public toSql = (qryContext?: IQueryContext) => this.toString(qryContext);
}

export function selectFrom<T>(
  from: SelectQryTablePrm<T>,
  cb?: (qry: SelectQry, t1: ReferencedTable<T>) => void
): SelectQry;
export function selectFrom<T>(
  from: [SelectQryTablePrm<T>],
  cb?: (qry: SelectQry, t1: ReferencedTable<T>) => void
): SelectQry;
export function selectFrom<T1, T2>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>],
  cb?: (
    qry: SelectQry,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>
  ) => void
): SelectQry;
export function selectFrom(
  from: SelectQryTablePrm<any> | SelectQryTablePrm<any>[],
  cb?: (qry: SelectQry, ...tables: any[]) => void
): SelectQry {
  const qry = new SelectQry(from);
  if (cb) {
    qry.executeCallback(cb);
  }
  return qry;
}
