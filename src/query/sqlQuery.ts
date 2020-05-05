import {
  BaseSqlExpression,
  fromClause,
  join,
  orderBy,
  QueryContext,
  selectClause,
  whereClause
} from './SQLExpression';
import {tbl} from './sqlTableQuery';
import {
  IFieldsMemberFn,
  IJoin,
  IOrderByFn,
  IQryCallback,
  ISelectQry,
  IOrderByClause,
  ISQLOrderByField,
  JoinType,
  SelectFieldPrm,
  SelectFields,
  SelectQryTablePrm
} from './types';
import {BaseReferenceTable, isReferencedTable} from './sqlTableFieldReference';
import {createSelectStatement} from './statements';
import {dbDialect} from '../db';
import {
  IDBTable,
  IFieldReference,
  IFieldReferenceFn,
  IQueryContext,
  ISQLExpression,
  ReferencedTable
} from '../dbTypes';

export class SelectQry extends BaseSqlExpression implements ISelectQry {
  protected from: ReferencedTable<any>[];
  protected selectFields?: SelectFields;
  protected rootWhere?: ISQLExpression;
  protected joins?: IJoin;
  protected orderByExpression?: IOrderByClause;
  public _maxRows?: number;

  constructor(
    tables: SelectQryTablePrm<any> | SelectQryTablePrm<any>[],
    maxRows?: number
  ) {
    super();
    if (!tables) {
      throw new Error('Expected at least one table');
    }
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      table instanceof BaseReferenceTable
        ? (table as ReferencedTable<any>)
        : tbl(table as IDBTable)
    );
    this._maxRows = maxRows;
  }

  public executeCallback = (cb: IQryCallback): void =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    cb(this, ...this.from);

  public fields: IFieldsMemberFn<ISelectQry> = (
    fields: SelectFieldPrm<any> | SelectFieldPrm<any>[]
  ): ISelectQry => {
    const flds = Array.isArray(fields) ? fields : [fields];
    this.selectFields = flds.map(fld =>
      typeof fld === 'function'
        ? (fld() as IFieldReference)
        : (fld as ISQLExpression | ReferencedTable<any>)
    );
    return this;
  };

  public orderBy: IOrderByFn<ISelectQry> = (
    fields: ISQLOrderByField | ISQLOrderByField[]
  ): ISelectQry => {
    this.orderByExpression = orderBy(fields);
    return this;
  };

  public join = (
    p1: IFieldReferenceFn | ISQLExpression,
    p2: IFieldReferenceFn | ISQLExpression,
    p3?: JoinType | IFieldReferenceFn | ISQLExpression,
    p4?: JoinType | IFieldReferenceFn,
    p5?: JoinType
  ) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    this.joins = join(p1, p2!, p3!, p4, p5);
    return this;
  };

  public where = (rootCond: ISQLExpression) => {
    this.rootWhere = rootCond;
    return this;
  };

  public maxRows = (maxRows: number) => {
    this._maxRows = maxRows;
    return this;
  };

  public toString = (context?: IQueryContext): string => {
    const queryContext = context || new QueryContext();
    let selectStatement = createSelectStatement(this._maxRows);
    if (this.selectFields) {
      const fieldInSelect: Array<IFieldReference | ISQLExpression> = [];
      for (const selectField of this.selectFields) {
        if (isReferencedTable(selectField)) {
          fieldInSelect.push(
            ...Array.from(selectField.fields.values()).map(fieldRef =>
              fieldRef.toSelectSql()
            )
          );
        } else {
          fieldInSelect.push(selectField);
        }
      }
      selectStatement.addClause('select', selectClause(fieldInSelect));
    } else {
      selectStatement.addClause(
        'select',
        selectClause(
          Object.values(this.from).reduce<ISQLExpression[]>(
            (fields, selectTable) =>
              fields.concat(
                selectTable.tbl.fields.map(field =>
                  (selectTable[
                    field.name as string
                  ] as IFieldReferenceFn)().toSelectSql()
                )
              ),
            []
          )
        )
      );
    }

    selectStatement.addClause(
      'from',
      fromClause(this.from, this.joins ? [this.joins] : [])
    );
    if (this.rootWhere) {
      selectStatement.addClause('where', whereClause(this.rootWhere));
    }
    if (
      this.orderByExpression &&
      this.orderByExpression.orderByFields.length > 0
    ) {
      selectStatement.addClause('orderBy', this.orderByExpression);
    }
    // Allow db dialects to modify the select statement if needed
    selectStatement = dbDialect().toSelectSql(selectStatement);
    return selectStatement.toSql(queryContext);
  };

  public toSql = (qryContext?: IQueryContext) => this.toString(qryContext);
}

export function selectFrom<T>(
  from: SelectQryTablePrm<T>,
  cb?: (qry: ISelectQry, t1: ReferencedTable<T>) => void
): ISelectQry;
export function selectFrom<T>(
  from: [SelectQryTablePrm<T>],
  cb?: (qry: ISelectQry, t1: ReferencedTable<T>) => void
): ISelectQry;
export function selectFrom<T1, T2>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>],
  cb?: (
    qry: ISelectQry,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>
  ) => void
): ISelectQry;
export function selectFrom(
  from: SelectQryTablePrm<any> | SelectQryTablePrm<any>[],
  cb?: (qry: ISelectQry, ...tables: any[]) => void
): ISelectQry {
  const qry = new SelectQry(from);
  if (cb) {
    qry.executeCallback(cb);
  }
  return qry;
}
