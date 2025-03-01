import {
  alias,
  AliasedReferenceSql,
  AliasSqlExpression,
  createAliasedResultColRef,
  isJoin,
  isResultsetColumn,
  isResultsetColumnRefFn,
  join
} from './SQLExpression';
import {tbl} from './sqlTableQuery';
import {
  IFieldsMemberFn,
  IFromClause,
  IJoin,
  IOrderByClause,
  IOrderByFn,
  IQryCallback,
  ISelectClause,
  ISQLOrderByField,
  IWhereClause,
  JoinType,
  MAX_SINGLE_LINE_STATEMENT_LENGTH,
  ReferencableTable,
  SelectFieldPrm,
  SelectFields,
  SelectQryTablePrm,
  SelectQuery
} from './types';
import {
  isCalculatedFieldReferenceFn,
  isCalculateFieldReference,
  isFieldSelectSqlExpression,
  isReferencedTable,
  isTableFieldReference,
  isTableFieldReferenceFn
} from './sqlTableFieldReference';
import {createSelectStatement} from './statements';
import {dbDialect} from '../db';
import {
  CalculatedFieldReferenceFn,
  ColumnReferenceFn,
  ColumnsRefs,
  IQueryContext,
  isIDBTable,
  ReferencedTable,
  ResultColumn,
  ResultSet,
  SQLAliasedExpression,
  SQLExpression,
  TableFieldReference,
  TableFieldReferenceFn
} from '../dbTypes';
import {QueryContext} from './queryContext';
import {countNLines, parenthesizeSql} from './utils';
import indentString from 'indent-string';
import {isSqlAliasedExpression, isTableDefinition} from './BaseSqlExpressions';
import {createDBTbl} from '../dbModel';

export interface ISelectOptions {
  maxRows?: number;
  alias?: string;
  isSelectDistinct?: boolean;
}

interface ColumnsAliasesState {
  aliases: Set<string>;
  subQueryColumnCounter: number;
  unexplicitAliasesMap: Map<string, number>;
}

/**
 * Just holds a resultset column and produces how it should be written
 * in a select clause
 */
class SubTableSelectColumn implements SQLAliasedExpression {
  private column: ResultColumn<any>;

  constructor(column: ResultColumn<any>) {
    this.column = column;
  }

  public get aliasingFor() {
    return this.column.aliasingFor;
  }

  public isSimpleValue = () => true;

  public toSql = () =>
    `${this.column.toReferenceSql} as "${this.column.alias}"`;

  public get alias() {
    return this.column.alias;
  }

  public set setAlias(_: string) {
    // no op
  }

  public get isExplicitAlias() {
    return this.column.isExplicitAlias;
  }
}

/**
 * When you do a select * from (select col1 as alias1, col2 as alias 2 from tbl) as sq
 * you want the outer query to reference the results as sq.alias1 as alias1, sq.alias2 as alias2 and so
 * forth.
 *
 * This class allows transforming the inner table reference to the latter
 *
 */
class SubTableColumnAliasExpression implements ResultColumn<any> {
  private innerColumnReference: SQLAliasedExpression;
  private subSelectQuery: SelectQuery;
  private _alias?: string;

  constructor(
    subSelectQuery: SelectQuery,
    innerColumnReference: SQLAliasedExpression
  ) {
    this.innerColumnReference = innerColumnReference;
    this.subSelectQuery = subSelectQuery;
  }

  public get aliasingFor() {
    return this.innerColumnReference;
  }

  public dbField() {
    return null;
  }

  public isSimpleValue = () => true;

  public get resultSet() {
    return this.subSelectQuery;
  }

  public get alias() {
    return this._alias || this.innerColumnReference.alias;
  }

  public get isExplicitAlias() {
    return Boolean(this._alias);
  }

  public toSql = () => this.toReferenceSql().toSql();

  public toSelectSql = (): SQLAliasedExpression =>
    new SubTableSelectColumn(this);

  public toReferenceSql = () => {
    return new AliasedReferenceSql(
      this.subSelectQuery,
      this.innerColumnReference
    );
  };

  public set setAlias(newAlias: string) {
    // We don't want to set the alias from the outer query
    this._alias = newAlias;
  }
}

class OverrideSelectAliasExpression implements SQLAliasedExpression {
  private expressionToOverride: SQLAliasedExpression;
  private aliasOverride: string;

  constructor(aliasedExpression: SQLAliasedExpression, aliasOverride: string) {
    this.aliasOverride = aliasOverride;
    this.expressionToOverride = aliasedExpression;
  }

  public get aliasingFor() {
    return this.expressionToOverride.aliasingFor;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext: IQueryContext = new QueryContext()) => {
    const originalAlias = this.expressionToOverride.alias;
    this.expressionToOverride.alias = this.aliasOverride;
    const sqlString = this.expressionToOverride.toSql(qryContext);
    this.expressionToOverride.alias = originalAlias;
    return sqlString;
  };

  public get alias() {
    return this.aliasOverride;
  }

  public set alias(newAlias: string) {
    this.aliasOverride = newAlias;
  }

  public get isExplicitAlias() {
    return true;
  }
}

function processSelectColumn(
  selectColumns: SQLExpression[],
  state: ColumnsAliasesState,
  column: SQLExpression
) {
  const {aliases, unexplicitAliasesMap} = state;
  if (isSqlAliasedExpression(column)) {
    if (column.isExplicitAlias) {
      aliases.add(column.alias);
      selectColumns.push(column);
      return column.alias;
    } else {
      if (aliases.has(column.alias)) {
        for (let i = unexplicitAliasesMap.get(column.alias) || 1; i < Number.MAX_SAFE_INTEGER; i++) {
          const ithAlias = i > 0 ? `${column.alias}${i + 1}` : column.alias;
          if (!aliases.has(ithAlias)) {
            aliases.add(ithAlias);
            unexplicitAliasesMap.set(column.alias, i + 1);
            selectColumns.push(
              new OverrideSelectAliasExpression(column, ithAlias)
            );
            return;
          }
        }
      } else {
        aliases.add(column.alias);
        selectColumns.push(column);
      }
    }
  } else {
    for (let i = state.subQueryColumnCounter; i < Number.MAX_SAFE_INTEGER; i++) {
      const ithAlias = `SQC${i + 1}`;
      if (!aliases.has(ithAlias)) {
        selectColumns.push(alias(column, ithAlias));
        aliases.add(ithAlias);
        state.subQueryColumnCounter = i + 1;
        return;
      }
    }
  }
}

/**
 * Represents the select clause of a select statement,
 * select with the various fields following.
 *
 * We don't do select * because we try to map named columns, and
 * we give unique names to the columns.
 *
 * If we get to named aliases with the same alias we throw an error
 */
class SelectClause implements ISelectClause {
  public _selectFields: SQLExpression[];
  readonly _isDistinct: boolean;

  constructor(columns: SQLExpression[] = [], isDistinct = false) {
    this._selectFields = [];
    this._isDistinct = isDistinct;
    const aliases: Set<string> = new Set();
    for (const column of columns) {
      if (isSqlAliasedExpression(column) && column.isExplicitAlias) {
        if (aliases.has(column.alias)) {
          throw new Error(
            `More than one column has the same explicit alias ${column.alias}`
          );
        }
        aliases.add(column.alias);
      }
    }
    const aliasesState: ColumnsAliasesState = {
      aliases,
      subQueryColumnCounter: 0,
      unexplicitAliasesMap: new Map()
    };
    for (const column of columns) {
      processSelectColumn(this._selectFields, aliasesState, column);
    }
  }

  public get selectFields() {
    return this._selectFields;
  }

  public get isDistinct() {
    return this._isDistinct;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext: IQueryContext = new QueryContext()) => {
    this._selectFields.sort((a, b) => {
      const aAlias =
        isTableFieldReference(a) ||
        isCalculateFieldReference(a) ||
        isFieldSelectSqlExpression(a) ||
        isResultsetColumn(a)
          ? a.alias
          : 'a';
      const bAlias =
        isTableFieldReference(b) ||
        isCalculateFieldReference(b) ||
        isFieldSelectSqlExpression(b) ||
        isResultsetColumn(b)
          ? b.alias
          : 'b';
      if ((aAlias || '') < (bAlias || '')) {
        return -1;
      }
      if ((aAlias || '') == (bAlias || '')) {
        return 0;
      }
      return 1;
    });
    const fieldsSql = this._selectFields
      .map(field =>
        isTableFieldReference(field) || isCalculateFieldReference(field)
          ? field.toSelectSql().toSql(qryContext)
          : field.toSql(qryContext)
      )
      .join(',\n');
    return `select${this._isDistinct ? ' distinct' : ''}${
      countNLines(fieldsSql) > 1 ? '\n' : ''
    }${indentString(fieldsSql, countNLines(fieldsSql) > 1 ? 2 : 1)}`;
  };
}

export const selectClause = (
  fields: SQLExpression[] = [],
  isSelectDistinct = false
): ISelectClause => new SelectClause(fields, isSelectDistinct);

export function isSelectClause(obj: any): obj is SQLExpression {
  return obj && obj instanceof SelectClause ? true : false;
}

class SqlOrderByClause<ObjShape> implements IOrderByClause {
  public orderByFields: ISQLOrderByField[];
  private selectClause: () => ColumnsRefs<
    ObjShape,
    | ColumnReferenceFn<ObjShape>
    | TableFieldReferenceFn<ObjShape>
    | CalculatedFieldReferenceFn<ObjShape>
  >;

  constructor(
    fields: ISQLOrderByField | ISQLOrderByField[],
    getSelectFields: () => ColumnsRefs<
      ObjShape,
      | ColumnReferenceFn<ObjShape>
      | TableFieldReferenceFn<ObjShape>
      | CalculatedFieldReferenceFn<ObjShape>
    >
  ) {
    this.orderByFields = Array.isArray(fields) ? fields : [fields];
    this.selectClause = getSelectFields;
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) =>
    this.orderByFields.length < 1
      ? ''
      : this.orderByFields.length === 1
      ? `order by ${this.fieldToSql(qryContext, this.orderByFields[0])}`
      : `order by\n${indentString(
          this.orderByFields
            .map(field => this.fieldToSql(qryContext, field))
            .join(',\n'),
          2
        )}`;

  private isOrderByFieldInSelectedFields(field: ResultColumn<ObjShape>) {
    const selectedFields = this.selectClause();
    for (const aliasCol in selectedFields) {
      const _selectedField = selectedFields[aliasCol];
      const selectedField =
        typeof _selectedField === 'function'
          ? _selectedField()
          : _selectedField;
      if (field === selectedField || field === selectedField.aliasingFor) {
        return true;
      }
    }
    return false;
  }

  protected fieldToSql = (
    qryContext: IQueryContext,
    {field: _field, isDesc}: ISQLOrderByField
  ): string => {
    const field = typeof _field === 'function' ? _field() : _field;

    let columnReference = '';
    if (isResultsetColumn(field) && field.isExplicitAlias) {
      columnReference = field.alias;
    } else if (isResultsetColumn(field) && isTableFieldReference(field)) {
      if (
        this.isOrderByFieldInSelectedFields(field as ResultColumn<ObjShape>)
      ) {
        columnReference = `"${field.alias}"`;
      } else {
        columnReference = field.readValueToSql().toSql(qryContext);
      }
    } else {
      columnReference = field.isSimpleValue()
        ? field.toSql(qryContext)
        : parenthesizeSql(field.toSql(qryContext));
    }

    return `${columnReference}${isDesc ? ' desc' : ''}`;
  };
}

function populateJoinTableSet(
  joins: IJoin[],
  tablesSet: Set<ResultSet<any>>
): void {
  for (const join of joins) {
    if (isTableFieldReference(join.from)) {
      tablesSet.add(join.from.qryTbl);
    }
    if (typeof join.from === 'function') {
      tablesSet.add(join.from().resultSet);
    }
    if (isJoin(join.from)) {
      populateJoinTableSet([join.from], tablesSet);
    }
    if (isTableFieldReference(join.to)) {
      tablesSet.add(join.to.qryTbl);
    }
    if (typeof join.to === 'function') {
      tablesSet.add(join.to().resultSet);
    }
    if (isJoin(join.to)) {
      populateJoinTableSet([join.to], tablesSet);
    }
  }
}

class FromClause implements IFromClause {
  public readonly tables: ResultSet<any>[];
  public readonly joins: IJoin[];

  constructor(tables: ResultSet<any>[] = [], joins: IJoin[] = []) {
    this.tables = tables;
    this.joins = joins;
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    if (this.tables.length === 0 && this.joins.length === 0) {
      return '';
    }
    let fromLines: string[];
    if (this.joins.length > 0) {
      // If there are joins, we need to add additional tables in the this.from
      // member, excluding the tables already referenced in the joins
      fromLines = this.joins.map(fromJoin => fromJoin.toSql(qryContext));
      const tablesToFilter = this.tablesInJoins();
      const fromRemaining = this.tables.filter(
        table => !tablesToFilter.has(table)
      );
      if (fromRemaining.length > 0) {
        fromLines.push(
          ...fromRemaining.map(table => fromSqlString(qryContext, table))
        );
      }
    } else {
      fromLines = this.tables.map(table => fromSqlString(qryContext, table));
    }
    const fromSqlLength =
      5 +
      fromLines.reduce(
        (cumLength, fromLine, index) =>
          cumLength + fromLine.length + (index > 0 ? 2 : 0),
        0
      );
    const tablesSql = fromLines.join(
      fromSqlLength <= MAX_SINGLE_LINE_STATEMENT_LENGTH ? ', ' : ',\n'
    );
    return `from${
      countNLines(tablesSql) > 1
        ? `\n${indentString(tablesSql, 2)}`
        : ` ${tablesSql}`
    }`;
  };

  private tablesInJoins = (): Set<ResultSet<any>> => {
    const tablesSet: Set<ResultSet<any>> = new Set();
    populateJoinTableSet(this.joins, tablesSet);
    return tablesSet;
  };
}

export function fromClause(
  tables: ResultSet<any>[] = [],
  joins: IJoin[] = []
): IFromClause {
  return new FromClause(tables, joins);
}
class WhereClause implements IWhereClause {
  public rootWhereExpression: SQLExpression;

  constructor(rootWhereExpression: SQLExpression) {
    this.rootWhereExpression = rootWhereExpression;
  }

  isSimpleValue = () => true;

  toSql = (qryContext: IQueryContext = new QueryContext()) => {
    const whereSql = this.rootWhereExpression.toSql(qryContext);
    return `where${countNLines(whereSql) > 1 ? '\n' : ''}${indentString(
      whereSql,
      countNLines(whereSql) > 1 ? 2 : 1
    )}`;
  };
}

export const whereClause = (
  rootWhereExpression: SQLExpression
): IWhereClause => {
  return new WhereClause(rootWhereExpression);
};

class DeleteClause<T> implements SQLExpression {
  private tblRef: ReferencedTable<T>;

  constructor(tblRef: ReferencedTable<T>) {
    this.tblRef = tblRef;
  }

  public isSimpleValue = () => true;

  public toSql = (): string => `delete from ${this.tblRef.tbl.dbName}`;
}

export const deleteClause = <T>(tbl: ReferencedTable<T>): SQLExpression =>
  new DeleteClause(tbl);

class SelectQry<ObjShape> implements SelectQuery<ObjShape> {
  private readonly from: Array<ResultSet<any>>;
  private selectFields?: SelectFields;
  private rootWhere?: SQLExpression;
  private joins?: IJoin;
  private orderByExpression?: IOrderByClause;
  public _maxRows?: number;
  private _alias?: string;
  private columsRefs: null | ColumnsRefs<ObjShape>;
  private _isSelectDistinct: boolean;

  constructor(
    tables: SelectQryTablePrm<any> | Array<SelectQryTablePrm<any>>,
    {maxRows, alias, isSelectDistinct = false}: ISelectOptions = {}
  ) {
    if (!tables) {
      throw new Error('Expected at least one table');
    }
    this._isSelectDistinct = isSelectDistinct;
    this._alias = alias;
    this.from = (Array.isArray(tables) ? tables : [tables]).map(table =>
      isReferencedTable(table)
        ? table
        : isIDBTable(table)
        ? tbl(table)
        : isTableDefinition(table)
        ? tbl(createDBTbl(table))
        : table
    );
    this._maxRows = maxRows;
    this.columsRefs = null;
  }

  public get aliasingFor() {
    return this;
  }

  public get alias() {
    return this._alias || 'SQ';
  }

  public set alias(newAlias) {
    this._alias = newAlias;
  }

  public get name() {
    return this.alias;
  }

  public get isExplicitAlias() {
    return Boolean(this._alias);
  }

  private processColumn(
    selectColumns: ColumnsRefs<
      ObjShape,
      | ColumnReferenceFn<ObjShape>
      | TableFieldReferenceFn<ObjShape>
      | CalculatedFieldReferenceFn<ObjShape>
    >,
    state: ColumnsAliasesState,
    column: SQLExpression
  ) {
    const {aliases, unexplicitAliasesMap} = state;
    let columnAlias = '';
    const dereferncedColumn =
      isTableFieldReferenceFn(column) ||
      isResultsetColumnRefFn(column) ||
      isCalculatedFieldReferenceFn(column)
        ? column()
        : column;
    if (isSqlAliasedExpression(dereferncedColumn)) {
      if (dereferncedColumn.isExplicitAlias) {
        aliases.add(dereferncedColumn.alias);
        columnAlias = dereferncedColumn.alias;
      } else {
        if (aliases.has(dereferncedColumn.alias)) {
          for (
            let i = unexplicitAliasesMap.get(dereferncedColumn.alias) || 1;
            i < Number.MAX_SAFE_INTEGER;
            i++
          ) {
            const ithAlias =
              i > 0
                ? `${dereferncedColumn.alias}${i + 1}`
                : dereferncedColumn.alias;
            if (!aliases.has(ithAlias)) {
              aliases.add(ithAlias);
              unexplicitAliasesMap.set(dereferncedColumn.alias, i + 1);
              columnAlias = ithAlias;
              break;
            }
          }
        } else {
          aliases.add(dereferncedColumn.alias);
          columnAlias = dereferncedColumn.alias;
        }
      }
    } else {
      for (let i = state.subQueryColumnCounter; i < Number.MAX_SAFE_INTEGER; i++) {
        const ithAlias = `SQC${i + 1}`;
        if (!aliases.has(ithAlias)) {
          columnAlias = ithAlias;
          aliases.add(ithAlias);
          state.subQueryColumnCounter = i + 1;
          break;
        }
      }
    }
    if (
      isTableFieldReferenceFn(column) ||
      isResultsetColumnRefFn(column) ||
      isCalculatedFieldReferenceFn(column)
    ) {
      if (column().alias !== columnAlias) {
        // The referenced alias is not the same as what is assigned, let's change
        // it.
        column(columnAlias);
      }
      selectColumns[columnAlias as keyof ObjShape] =
        column as ColumnReferenceFn<ObjShape>;
    } else {
      let ref: ColumnReferenceFn<ObjShape>;
      if (isSqlAliasedExpression(column)) {
        if (column.alias !== columnAlias) {
          column.alias = columnAlias;
        }
        ref = createAliasedResultColRef(this, column);
      } else {
        ref = createAliasedResultColRef(
          this,
          new AliasSqlExpression(column, columnAlias)
        );
      }
      selectColumns[columnAlias as keyof ObjShape] = ref;
    }
  }

  public get cols(): ColumnsRefs<
    ObjShape,
    | ColumnReferenceFn<ObjShape>
    | TableFieldReferenceFn<ObjShape>
    | CalculatedFieldReferenceFn<ObjShape>
  > {
    if (this.columsRefs) {
      return this.columsRefs;
    }
    this.columsRefs = {} as ColumnsRefs<ObjShape>;
    // 1. Unwind the selectField records in single columns
    const columns: SQLExpression[] = [];
    if (this.selectFields) {
      for (const selectField of this.selectFields) {
        if (isSelectQuery(selectField)) {
          for (const colRef in selectField.cols) {
            columns.push(
              new SubTableColumnAliasExpression(
                selectField,
                selectField.cols[colRef]()
              )
            );
          }
        } else if (isReferencedTable(selectField)) {
          for (const colRef in selectField.cols) {
            if (isTableFieldReferenceFn(selectField.cols[colRef])) {
              columns.push(selectField.cols[colRef]);
            }
          }
        } else {
          if (
            isTableFieldReferenceFn(selectField) &&
            isSelectQuery(selectField().resultSet)
          ) {
            columns.push(
              new SubTableColumnAliasExpression(
                selectField().resultSet as SelectQuery<any>,
                selectField()
              )
            );
          } else {
            columns.push(selectField);
          }
        }
      }
    } else {
      for (const resultSet of this.from) {
        if (isSelectQuery(resultSet)) {
          for (const colRef in resultSet.cols) {
            columns.push(
              new SubTableColumnAliasExpression(
                resultSet,
                resultSet.cols[colRef]()
              )
            );
          }
        } else {
          for (const colRef in resultSet.cols) {
            if (isTableFieldReferenceFn(resultSet.cols[colRef])) {
              columns.push(resultSet.cols[colRef]);
            }
          }
        }
      }
    }

    // 2. Assign unique aliases to each column
    const aliases: Set<string> = new Set();
    for (const column of columns) {
      if (isSqlAliasedExpression(column) && column.isExplicitAlias) {
        if (aliases.has(column.alias)) {
          throw new Error(
            `More than one column has the same explicit alias ${column.alias}`
          );
        }
        aliases.add(column.alias);
      }
    }
    const aliasesState: ColumnsAliasesState = {
      aliases,
      subQueryColumnCounter: 0,
      unexplicitAliasesMap: new Map()
    };
    for (const column of columns) {
      this.processColumn(this.columsRefs, aliasesState, column);
    }

    return this.columsRefs;
  }

  public toReferenceSql = (qryContext: IQueryContext = new QueryContext()) => {
    return this.aliasToUse(qryContext);
  };

  private aliasToUse = (qryContext: IQueryContext): string => {
    let contextAlias = qryContext.tableRefAlias(this);
    if (!contextAlias) {
      contextAlias = qryContext.addTable(this, this._alias);
    }
    return contextAlias;
  };

  public executeCallback = (cb: IQryCallback): void =>
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    cb(this, ...this.from);

  public fields: IFieldsMemberFn<SelectQuery<ObjShape>> = (
    fields: SelectFieldPrm<any> | SelectFieldPrm<any>[]
  ): SelectQuery<ObjShape> => {
    const flds = Array.isArray(fields) ? fields : [fields];
    this.selectFields = flds.map(fld =>
      typeof fld === 'function' ? fld() : fld
    );
    this.columsRefs = null;
    return this as unknown as SelectQuery<ObjShape>;
  };

  public selectDistinct = (isSelectDistinct: boolean) => {
    this._isSelectDistinct = isSelectDistinct;
    return this;
  };

  public orderBy: IOrderByFn<SelectQuery<ObjShape>> = (
    fields: ISQLOrderByField | ISQLOrderByField[]
  ): SelectQuery<ObjShape> => {
    this.orderByExpression = new SqlOrderByClause(fields, () => this.cols);
    return this;
  };

  public join = (
    p1: ColumnReferenceFn<any> | SQLExpression,
    p2: ColumnReferenceFn<any> | SQLExpression,
    p3?: JoinType | ColumnReferenceFn<any> | SQLExpression,
    p4?: JoinType | ColumnReferenceFn<any>,
    p5?: JoinType
  ) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.joins = join(p1, p2!, p3!, p4, p5);
    return this;
  };

  public where = (rootCond: SQLExpression) => {
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
    const fieldInSelect: Array<TableFieldReference | SQLExpression> = [];
    for (const colAlias in this.cols) {
      fieldInSelect.push(this.cols[colAlias]().toSelectSql());
    }
    selectStatement.addClause(
      'select',
      selectClause(fieldInSelect, this._isSelectDistinct)
    );

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

  public isSimpleValue = () => false;
}

function fromSqlString(
  qryContext: IQueryContext,
  fromResultSet: ResultSet<any>
): string {
  if (fromResultSet instanceof SelectQry) {
    let existingAlias = qryContext.tableRefAlias(fromResultSet);
    if (!existingAlias) {
      existingAlias = qryContext.addTable(fromResultSet);
    }
    const subQrySql = fromResultSet.toSql(qryContext);
    if (
      countNLines(subQrySql) === 1 &&
      '() as ""'.length + subQrySql.length + existingAlias.length <=
        MAX_SINGLE_LINE_STATEMENT_LENGTH
    ) {
      return `(${subQrySql}) as "${existingAlias}"`;
    } else {
      return `(
${indentString(subQrySql, 2)}
) as "${existingAlias}"`;
    }
  }
  return fromResultSet.toSql(qryContext);
}

export function selectFrom<T, Projection = T>(
  from: ReferencableTable<T>,
  cb?: (qry: SelectQuery<T>, t1: ReferencedTable<T>) => void
): SelectQuery<T, Projection>;
export function selectFrom<T, Projection = T>(
  from: SelectQryTablePrm<T>,
  cb?: (qry: SelectQuery<T>, t1: ResultSet<T>) => void
): SelectQuery<T, Projection>;
export function selectFrom<T, Projection = T>(
  from: [ReferencableTable<T>],
  cb?: (qry: SelectQuery<T>, t1: ReferencedTable<T>) => void
): SelectQuery<T, Projection>;
export function selectFrom<T, Projection = T>(
  from: [SelectQryTablePrm<T>],
  cb?: (qry: SelectQuery<T>, t1: ResultSet<T>) => void
): SelectQuery<T, Projection>;
export function selectFrom<T1, T2, Projection = T1 & T2>(
  from: [ReferencableTable<T1>, ReferencableTable<T2>],
  cb?: (
    qry: SelectQuery<T1 & T2>,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>
  ) => void
): SelectQuery<T1 & T2, Projection>;
export function selectFrom<T1, T2, Projection = T1 & T2>(
  from: [ReferencableTable<T1>, SelectQryTablePrm<T2>],
  cb?: (
    qry: SelectQuery<T1 & T2>,
    t1: ReferencedTable<T1>,
    t2: ResultSet<T2>
  ) => void
): SelectQuery<T1 & T2, Projection>;
export function selectFrom<T1, T2, Projection = T1 & T2>(
  from: [SelectQryTablePrm<T1>, ReferencableTable<T2>],
  cb?: (
    qry: SelectQuery<T1 & T2>,
    t1: ResultSet<T1>,
    t2: ReferencedTable<T2>
  ) => void
): SelectQuery<T1 & T2, Projection>;
export function selectFrom<T1, T2, Projection = T1 & T2>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>],
  cb?: (qry: SelectQuery<T1 & T2>, t1: ResultSet<T1>, t2: ResultSet<T2>) => void
): SelectQuery<T1 & T2, Projection>;
export function selectFrom<T1, T2, T3, Projection = T1 & T2 & T3>(
  from: [ReferencableTable<T1>, ReferencableTable<T2>, ReferencableTable<T3>],
  cb?: (
    qry: SelectQuery<T1 & T2 & T3>,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>,
    t3: ReferencedTable<T3>
  ) => void
): SelectQuery<T1 & T2 & T3, Projection>;
export function selectFrom<T1, T2, T3, Projection = T1 & T2 & T3>(
  from: [ReferencableTable<T1>, ReferencableTable<T2>, SelectQryTablePrm<T3>],
  cb?: (
    qry: SelectQuery<T1 & T2 & T3>,
    t1: ReferencedTable<T1>,
    t2: ReferencedTable<T2>,
    t3: ResultSet<T3>
  ) => void
): SelectQuery<T1 & T2 & T3, Projection>;
export function selectFrom<T1, T2, T3, Projection = T1 & T2 & T3>(
  from: [ReferencableTable<T1>, SelectQryTablePrm<T2>, SelectQryTablePrm<T3>],
  cb?: (
    qry: SelectQuery<T1 & T2 & T3>,
    t1: ReferencedTable<T1>,
    t2: ResultSet<T2>,
    t3: ResultSet<T3>
  ) => void
): SelectQuery<T1 & T2 & T3, Projection>;
export function selectFrom<T1, T2, T3, Projection = T1 & T2 & T3>(
  from: [SelectQryTablePrm<T1>, SelectQryTablePrm<T2>, SelectQryTablePrm<T3>],
  cb?: (
    qry: SelectQuery<T1 & T2 & T3>,
    t1: ResultSet<T1>,
    t2: ResultSet<T2>,
    t3: ResultSet<T3>
  ) => void
): SelectQuery<T1 & T2 & T3, Projection>;
export function selectFrom(
  from: SelectQryTablePrm<any> | Array<SelectQryTablePrm<any>>,
  cb?: (qry: SelectQuery<any>, ...tables: any[]) => void
): SelectQuery<any> {
  const qry = new SelectQry<any>(from);
  if (cb) {
    qry.executeCallback(cb);
  }
  return qry;
}

export function isSelectQuery(obj: any): obj is SelectQuery<any> {
  return Boolean(obj && typeof obj === 'object' && obj instanceof SelectQry);
}
