import {
  FormattedSqlValueExpression,
  parenthesized,
  QueryContext,
  rawSql
} from './SQLExpression';
import {IFieldSelectSqlExpression} from './types';
import {dbDialect} from '../db';
import {
  ICalculatedFieldReference,
  ICalculatedFieldReferenceFn,
  IDBField,
  IDBTable,
  IFieldReference,
  IFieldReferenceFn,
  IQueryContext,
  ISQLExpression,
  ITableCalculateFieldDefinition,
  IToSqlFn,
  ReferencedTable
} from '../dbTypes';

class FieldSelectSqlExpression<T> implements IFieldSelectSqlExpression<T> {
  public readonly field: IFieldReference<T> | ICalculatedFieldReference<T>;

  constructor(field: IFieldReference<T> | ICalculatedFieldReference<T>) {
    this.field = field;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) => {
    return `${this.field.readValueToSql().toSql(qryContext)} as "${
      this.field.alias
    }"`;
  };
}

export function isFieldSelectSqlExpression(
  obj: any
): obj is IFieldSelectSqlExpression {
  if (obj instanceof FieldSelectSqlExpression) return true;
  return false;
}

class FieldToReferenceSqlExpression<T> implements ISQLExpression {
  private field: FieldReference<T> | ICalculatedFieldReference<T>;

  constructor(field: FieldReference<T> | ICalculatedFieldReference<T>) {
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

export class FieldReference<T> implements IFieldReference<T> {
  public readonly field: IDBField<T>;
  public readonly qryTbl: ReferencedTable<T>;
  protected _alias?: string;

  constructor(qryTbl: ReferencedTable<T>, field: IDBField<T>, alias?: string) {
    this.field = field;
    this.qryTbl = qryTbl;
    if (alias) {
      this._alias = alias;
    }
  }

  public get alias() {
    return this._alias || (this.field.name as string);
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext: IQueryContext = new QueryContext()) =>
    this.toReferenceSql().toSql(qryContext);

  public toSelectSql = (): ISQLExpression => {
    return new FieldSelectSqlExpression(this);
  };

  public toReferenceSql = (): ISQLExpression =>
    new FieldToReferenceSqlExpression(this);

  public readValueToSql = (value?: ISQLExpression): ISQLExpression => {
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
    value: ISQLExpression | undefined,
    isInsert = false
  ): ISQLExpression => {
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

  public toUpdateFieldSql = (value: ISQLExpression): ISQLExpression => {
    return new FormattedSqlValueExpression(updateFieldFormatFn, [
      rawSql(this.field.dbName),
      this.writeValueToSQL(value)
    ]);
  };
}

export function isFieldReference(obj: any): obj is IFieldReference {
  if (
    (obj as IFieldReference).qryTbl &&
    (obj as IFieldReference).toReferenceSql
  ) {
    return true;
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
): IFieldReferenceFn<T> {
  let ref: IFieldReference<T> = new FieldReference(qryTbl, field, alias);
  const fn = (newAlias?: string) => {
    if (newAlias && newAlias !== ref.alias) {
      ref = new FieldReference(qryTbl, field, alias);
    }
    return ref;
  };
  fn.toSql = (qryContext?: IQueryContext): string => {
    return ref.toSql(qryContext);
  };
  fn.isSimpleValue = () => ref.isSimpleValue();
  return fn;
}

interface IToBooleanFn {
  (): boolean;
}

class CalculateFieldReference<DBTable>
  implements ICalculatedFieldReference<DBTable> {
  public readonly field: ITableCalculateFieldDefinition<DBTable>;
  public readonly qryTbl: ReferencedTable<DBTable>;
  protected _alias?: string;

  constructor(
    qryTbl: ReferencedTable<DBTable>,
    calcField: ITableCalculateFieldDefinition<DBTable>,
    alias?: string
  ) {
    this.field = calcField;
    this.qryTbl = qryTbl;
    if (alias) {
      this._alias = alias;
    }
  }

  public get alias() {
    return this._alias || (this.field.name as string);
  }

  public isSimpleValue = () => false;

  public toSelectSql = (): ISQLExpression => {
    return new FieldSelectSqlExpression(this);
  };

  public readValueToSql = (): ISQLExpression =>
    parenthesized(this.field.calculation(this.qryTbl));

  public toSql = (qryContext: IQueryContext = new QueryContext()): string =>
    this.readValueToSql().toSql(qryContext);
}

export function isCalculateFieldReference(
  obj: any
): obj is ICalculatedFieldReference {
  return obj && obj instanceof CalculateFieldReference;
}

export function createCalcFieldReferenceFn<T>(
  qryTbl: ReferencedTable<T>,
  calcField: ITableCalculateFieldDefinition<T>,
  alias?: string
): ICalculatedFieldReferenceFn<T> {
  let ref: ICalculatedFieldReference<T> = new CalculateFieldReference(
    qryTbl,
    calcField,
    alias
  );
  const fn = (newAlias?: string): ICalculatedFieldReference<T> => {
    if (newAlias && newAlias !== ref.alias) {
      ref = new CalculateFieldReference(qryTbl, calcField, alias);
    }
    return ref;
  };
  fn.toSql = (qryContext?: IQueryContext): string => ref.toSql(qryContext);
  fn.isSimpleValue = (): boolean => ref.isSimpleValue();
  return fn;
}

export class BaseReferenceTable<T = any> implements ISQLExpression {
  [fieldname: string]:
    | IFieldReferenceFn<T>
    | ICalculatedFieldReferenceFn<T>
    | IDBTable<T>
    | string
    | undefined
    | IToSqlFn
    | IToBooleanFn
    | Map<keyof T, IFieldReference<T>>;
  public tbl: IDBTable<T>;
  public alias?: string;
  private _fieldsReferences: Map<keyof T, IFieldReference<T>>;

  constructor(tbl: IDBTable<T>, alias?: string) {
    this.tbl = tbl;
    this._fieldsReferences = new Map();
    if (alias) {
      this.alias = alias;
    }
    this.tbl.fields.forEach(field => {
      const fieldRefFn = createFieldReferenceFn(
        (this as any) as ReferencedTable<T>,
        field
      );
      this[field.name as string] = fieldRefFn;
      this._fieldsReferences.set(field.name, fieldRefFn());
    });

    if (this.tbl.calculatedFields) {
      for (const calcField of this.tbl.calculatedFields) {
        this[calcField.name as string] = createCalcFieldReferenceFn(
          (this as any) as ReferencedTable<T>,
          calcField
        );
      }
    }
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
      (this as any) as ReferencedTable<T>
    );
    if (!contextAlias) {
      contextAlias = queryContext.addTable((this as any) as ReferencedTable<T>);
    }
    return contextAlias;
  };
}

export function createReferencedTable<T>(
  dbTable: IDBTable<T>,
  alias?: string
): ReferencedTable<T> {
  return (new BaseReferenceTable(dbTable, alias) as any) as ReferencedTable<T>;
}

export function isReferencedTable(obj: any): obj is ReferencedTable<any> {
  if (obj instanceof BaseReferenceTable) return true;
  return false;
}
