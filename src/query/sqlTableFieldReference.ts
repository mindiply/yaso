import {IFieldSelectSqlExpression} from './types';
import {dbDialect} from '../db';
import {
  CalculatedFieldReference,
  IDBField,
  IDBTable,
  TableFieldReference,
  IQueryContext,
  SQLExpression,
  TableCalculateFieldDefinition,
  ReferencedTable,
  TableFieldReferenceFn,
  CalculatedFieldReferenceFn,
  ResultSet,
  ColumnsRefs,
  SQLAliasedExpression
} from '../dbTypes';
import {QueryContext} from './queryContext';
import {
  FormattedSqlValueExpression,
  parenthesized,
  rawSql
} from './BaseSqlExpressions';

class FieldSelectSqlExpression<T> implements IFieldSelectSqlExpression<T> {
  public readonly field: TableFieldReference<T> | CalculatedFieldReference<T>;

  public get alias() {
    return this.field.alias;
  }

  public set alias(newAlias: string) {
    this.field.alias = newAlias;
  }

  public get isExplicitAlias() {
    return this.field.isExplicitAlias;
  }

  constructor(field: TableFieldReference<T> | CalculatedFieldReference<T>) {
    this.field = field;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) => {
    const readSqlExpression = this.field.readValueToSql();
    return `${readSqlExpression.toSql(qryContext)} as "${this.field.alias}"`;
  };
}

export function isFieldSelectSqlExpression(
  obj: any
): obj is IFieldSelectSqlExpression {
  if (obj instanceof FieldSelectSqlExpression) return true;
  return false;
}

class FieldToReferenceSqlExpression<T> implements SQLExpression {
  private field: TblFieldReference<T> | CalculatedFieldReference<T>;

  constructor(field: TblFieldReference<T> | CalculatedFieldReference<T>) {
    this.field = field;
  }

  public isSimpleValue = () => true;

  public toSql = (context?: IQueryContext) => {
    const qryContext = context || new QueryContext();
    return `${this.field.qryTbl.toReferenceSql(qryContext)}.${
      this.field.field.dbName
    }`;
  };
}

export class TblFieldReference<T> implements TableFieldReference<T> {
  public readonly field: IDBField<T>;
  public readonly resultSet: ResultSet<T>;
  public readonly qryTbl: ReferencedTable<T>;
  protected _alias?: string;

  constructor(qryTbl: ReferencedTable<T>, field: IDBField<T>, alias?: string) {
    this.field = field;
    this.qryTbl = qryTbl;
    this.resultSet = qryTbl;
    if (alias) {
      this._alias = alias;
    }
  }

  public get alias() {
    return this._alias || (this.field.name as string);
  }

  public set alias(updatedAlias) {
    this._alias = updatedAlias;
  }

  public get isExplicitAlias() {
    return Boolean(this._alias);
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext: IQueryContext = new QueryContext()) =>
    this.toReferenceSql().toSql(qryContext);

  public toSelectSql = (): SQLAliasedExpression => {
    return new FieldSelectSqlExpression(this);
  };

  public toReferenceSql = (): SQLExpression =>
    new FieldToReferenceSqlExpression(this);

  public readValueToSql = (value?: SQLExpression): SQLExpression => {
    const {isEncrypted, isPwHash, isHash} = this.field;
    return isEncrypted
      ? dbDialect().decryptField(value || this)
      : isHash
      ? dbDialect().hashField(value || this)
      : isPwHash
      ? dbDialect().hashPwFieldVal(value || this, this)
      : value || this;
  };

  public writeValueToSQL = (
    value: SQLExpression | undefined,
    isInsert = false
  ): SQLExpression => {
    const {
      isCC,
      isEncrypted,
      isInsertTimestamp,
      isUpdateTimestamp,
      isHash,
      isPwHash
    } = this.field;
    return isEncrypted
      ? value
        ? dbDialect().encryptField(value)
        : rawSql('NULL')
      : isHash
      ? value
        ? dbDialect().hashField(value)
        : rawSql('NULL')
      : isPwHash
      ? value
        ? dbDialect().hashPwField(value)
        : rawSql('NULL')
      : isCC && !value
      ? isInsert
        ? rawSql('0')
        : rawSql(`${this.field.dbName} + 1`)
      : ((isInsertTimestamp && isInsert) || isUpdateTimestamp) && !value
      ? dbDialect().now()
      : value || this;
  };

  public toUpdateFieldSql = (value: SQLExpression): SQLExpression => {
    return new FormattedSqlValueExpression(updateFieldFormatFn, [
      rawSql(this.field.dbName),
      this.writeValueToSQL(value)
    ]);
  };
}

export function isTableFieldReference(obj: any): obj is TableFieldReference {
  if (obj && obj instanceof TblFieldReference) {
    return true;
  }
  return false;
}

export function isTableFieldReferenceFn(
  obj: any
): obj is TableFieldReferenceFn<any> {
  if (obj && typeof obj === 'function') {
    return isTableFieldReference(obj());
  }
  return false;
}

export function isCalculatedFieldReferenceFn(
  obj: any
): obj is CalculatedFieldReferenceFn<any> {
  if (obj && typeof obj === 'function') {
    return isCalculateFieldReference(obj());
  }
  return false;
}

function updateFieldFormatFn(fieldStr?: string, valueStr?: string): string {
  return `${fieldStr} = ${valueStr}`;
}

export function createFieldReferenceFn<T>(
  qryTbl: ReferencedTable<T>,
  field: IDBField<T>,
  alias?: string
): TableFieldReferenceFn<T> {
  const ref: TableFieldReference<T> = new TblFieldReference(
    qryTbl,
    field,
    alias
  );
  const fn = (newAlias?: string) => {
    if (newAlias && newAlias !== ref.alias) {
      ref.alias = newAlias;
    }
    return ref;
  };
  fn.toSql = (qryContext?: IQueryContext): string => {
    return ref.toSql(qryContext);
  };
  fn.isSimpleValue = () => ref.isSimpleValue();
  return fn;
}

class CalculateFieldReference<ObjShape>
  implements CalculatedFieldReference<ObjShape>
{
  public readonly field: TableCalculateFieldDefinition<ObjShape>;
  public readonly qryTbl: ReferencedTable<ObjShape>;
  public readonly resultSet: ResultSet<ObjShape>;
  protected _alias?: string;

  constructor(
    qryTbl: ReferencedTable<ObjShape>,
    calcField: TableCalculateFieldDefinition<ObjShape>,
    alias?: string
  ) {
    this.field = calcField;
    this.qryTbl = qryTbl;
    this.resultSet = qryTbl;
    if (alias) {
      this._alias = alias;
    }
  }

  public get alias() {
    return this._alias || (this.field.name as string);
  }

  public set alias(updatedAlias) {
    this._alias = updatedAlias;
  }

  public get isExplicitAlias() {
    return Boolean(this._alias);
  }

  public isSimpleValue = () => false;

  public toSelectSql = (): SQLAliasedExpression => {
    return new FieldSelectSqlExpression(this);
  };

  public toReferenceSql = () => this.readValueToSql();

  public readValueToSql = (): SQLExpression =>
    parenthesized(this.field.calculation(this.qryTbl));

  public toSql = (qryContext: IQueryContext = new QueryContext()): string =>
    this.readValueToSql().toSql(qryContext);
}

export function isCalculateFieldReference(
  obj: any
): obj is CalculatedFieldReference {
  return obj && obj instanceof CalculateFieldReference;
}

export function createCalcFieldReferenceFn<T>(
  qryTbl: ReferencedTable<T>,
  calcField: TableCalculateFieldDefinition<T>,
  alias?: string
): CalculatedFieldReferenceFn<T> {
  const ref: CalculatedFieldReference<T> = new CalculateFieldReference(
    qryTbl,
    calcField,
    alias
  );
  const fn = (newAlias?: string): CalculatedFieldReference<T> => {
    if (newAlias && newAlias !== ref.alias) {
      ref.alias = newAlias;
    }
    return ref;
  };
  fn.toSql = (qryContext?: IQueryContext): string => ref.toSql(qryContext);
  fn.isSimpleValue = (): boolean => ref.isSimpleValue();
  return fn;
}

/*
function addColumnsRefs<ObjShapeIn, ObjShapeAdded>(
  colsRefs: ColumnsRefs<ObjShapeIn> = {} as ColumnsRefs<ObjShapeIn>,
  fields: Array<IDBField<ObjShapeAdded>>
): ColumnsRefs<ObjShapeIn & ObjShapeAdded> {
  const updatedRefs = {...colsRefs} as ColumnsRefs<ObjShapeIn & ObjShapeAdded>;
  for (const field of fields) {
    updatedRefs[field.name] = createFieldReferenceFn();
  }
  return updatedRefs;
}
*/

export class BaseReferenceTable<ObjShape = any>
  implements ReferencedTable<ObjShape>
{
  public tbl: IDBTable<ObjShape>;
  private _alias?: string;
  private _fieldsReferences: Map<keyof ObjShape, TableFieldReference<ObjShape>>;
  private _cols: ColumnsRefs<
    ObjShape,
    TableFieldReferenceFn<ObjShape> | CalculatedFieldReferenceFn<ObjShape>
  >;

  constructor(tbl: IDBTable<ObjShape>, alias?: string) {
    this.tbl = tbl;
    this._fieldsReferences = new Map();
    if (alias) {
      this._alias = alias;
    }
    this._cols = {} as ColumnsRefs<
      ObjShape,
      TableFieldReferenceFn<ObjShape> | CalculatedFieldReferenceFn<ObjShape>
    >;
    this.tbl.fields.forEach(field => {
      const fieldRefFn = createFieldReferenceFn(this, field);
      this._cols[field.name] = fieldRefFn;
      this._fieldsReferences.set(
        field.name,
        fieldRefFn() as unknown as TableFieldReference<ObjShape>
      );
    });

    if (this.tbl.calculatedFields) {
      for (const calcField of this.tbl.calculatedFields) {
        this._cols[calcField.name] = createCalcFieldReferenceFn(
          this,
          calcField
        );
      }
    }
  }

  public get alias() {
    return this._alias ? this._alias : this.tbl.dbName;
  }

  public set alias(newAlias: string) {
    this._alias = newAlias;
  }

  public get name() {
    return this.tbl.dbName;
  }

  public get isExplicitAlias() {
    return Boolean(this._alias);
  }

  public get cols() {
    return this._cols;
  }

  public get fields() {
    return this._fieldsReferences;
  }

  public toSql = (qryContext: IQueryContext = new QueryContext()): string => {
    const aliasToUse = this.aliasToUse(qryContext);
    return `${this.tbl.dbName}${
      aliasToUse !== this.tbl.dbName ? ` as "${aliasToUse}"` : ''
    }`;
  };

  public toReferenceSql = (
    qryContext: IQueryContext = new QueryContext()
  ): string => this.aliasToUse(qryContext);

  public isSimpleValue = () => true;

  protected aliasToUse = (
    qryContext: IQueryContext = new QueryContext()
  ): string => {
    const queryContext = qryContext || new QueryContext();
    let contextAlias = queryContext.tableRefAlias(
      this as any as ReferencedTable<ObjShape>
    );
    if (!contextAlias) {
      contextAlias = queryContext.addTable(
        this as any as ReferencedTable<ObjShape>
      );
    }
    return contextAlias;
  };
}

export function createReferencedTable<T>(
  dbTable: IDBTable<T>,
  alias?: string
): ReferencedTable<T> {
  return new BaseReferenceTable(dbTable, alias) as any as ReferencedTable<T>;
}

export function isReferencedTable<T = any>(
  obj: any
): obj is ReferencedTable<T> {
  if (obj instanceof BaseReferenceTable) return true;
  return false;
}
