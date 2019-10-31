import {DBField, DBTable} from '../dbModel';
import {ISQLExpression} from './SQLExpression';
import {ToStringFn} from './sqlQuery';

export interface IFieldReference<T = any> extends ISQLExpression {
  field: DBField<T>;
  qryTbl: ReferencedTable<T>;
  toSelectSql: () => string;
  toReferenceSql: () => string;
  toUpdateFieldSql: (val: ISQLExpression) => string;
  readValueToSql: (val: ISQLExpression) => string;
  writeValueToSQL: (val: ISQLExpression) => string;
}

export type IFieldReferenceFn<T = any> = (
  newAlias?: string
) => IFieldReference<T>;

export class FieldReference<T> implements IFieldReference {
  public field: DBField<T>;
  public qryTbl: ReferencedTable<T>;
  protected _alias?: string;

  constructor(qryTbl: ReferencedTable<T>, field: DBField<T>, alias?: string) {
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

  public toSql = () => this.toReferenceSql();

  public toSelectSql = (): string => {
    return `${this.readValueToSql()} as "${this.alias}"`;
  };

  public toReferenceSql = (): string =>
    `${this.qryTbl.toReferenceSql()}.${this.field.dbName}`;

  public toInsertSqlField = (): string => this.field.dbName;

  public readValueToSql = (value?: ISQLExpression): string => {
    const {isEncrypted, isPwHash, isHash} = this.field;
    const strVal = value ? value.toSql() : this.toReferenceSql();

    return isEncrypted
      ? `${this.decryptField(strVal)}`
      : isHash
      ? this.hashField(strVal)
      : isPwHash
      ? this.hashPwFieldVal(strVal)
      : strVal;
  };

  public writeValueToSQL = (
    value: ISQLExpression | undefined,
    isInsert = false
  ): string => {
    const {
      isCC,
      isEncrypted,
      isInsertTimestamp,
      isUpdateTimestamp,
      isHash,
      isPwHash
    } = this.field;
    const strVal = value ? value.toSql() : `''`;
    return isEncrypted
      ? value
        ? this.encryptField(strVal)
        : 'NULL'
      : isHash
      ? value
        ? this.hashField(strVal)
        : 'NULL'
      : isPwHash
      ? value
        ? this.hashPwField(strVal)
        : 'NULL'
      : isCC && !value
      ? isInsert
        ? '0'
        : `${this.field.dbName} + 1`
      : ((isInsertTimestamp && isInsert) || isUpdateTimestamp) && !value
      ? this.now()
      : strVal;
  };

  public fieldReferenceSql = (): string =>
    `${this.qryTbl.alias}.${this.field.dbName}`;

  public toUpdateFieldSql = (value: ISQLExpression): string => {
    return `${this.field.dbName} = ${this.writeValueToSQL(value)}`;
  };

  protected encryptField = (fldText: string): string => fldText;
  protected decryptField = (fldText: string): string => fldText;
  protected hashField = (fldText: string): string => fldText;
  protected hashPwField = (fldText: string): string => fldText;
  protected hashPwFieldVal = (fldText: string): string => fldText;
  protected now = (): string => 'current_timestamp';
}

export type ReferencedTable<T> = {
  [P in keyof Required<T>]: IFieldReferenceFn<T[P]>;
} & {
  [field: string]:
    | IFieldReferenceFn
    | DBTable<T>
    | string
    | undefined
    | ToStringFn;
} & {
  alias?: string;
  tbl: DBTable<T>;
  toSql: ToStringFn;
  toReferenceSql: ToStringFn;
};

let FieldReferenceClass: typeof FieldReference = FieldReference;

export function setFieldReferenceClass(fieldRefClass: typeof FieldReference) {
  FieldReferenceClass = fieldRefClass;
}

export function createFieldReferenceFn<T>(
  qryTbl: ReferencedTable<T>,
  field: DBField<T>,
  alias?: string
): IFieldReferenceFn<T> {
  const ref: IFieldReference<T> = new FieldReferenceClass(qryTbl, field);
  if (alias) {
    ref.alias = alias;
  }
  return (newAlias?: string): IFieldReference<T> => {
    if (newAlias) {
      ref.alias = newAlias;
    }
    return ref;
  };
}

export class BaseReferenceTable<T = any> {
  [fieldname: string]:
    | IFieldReferenceFn
    | DBTable<T>
    | string
    | undefined
    | ToStringFn;
  public tbl: DBTable<T>;
  public alias?: string;

  constructor(tbl: DBTable<T>, alias?: string) {
    this.tbl = tbl;
    if (alias) {
      this.alias = alias;
    }
    this.tbl.fields.forEach(field => {
      this[field.name as string] = createFieldReferenceFn(
        this as ReferencedTable<T>,
        field
      );
    });
  }

  public toSql = (): string =>
    `${this.tbl.dbName}${this.alias ? ` as "${this.alias}"` : ''}`;

  public toReferenceSql = (): string => this.alias || this.tbl.dbName;
}

export function createReferencedTable<T>(
  dbTable: DBTable<T>,
  alias?: string
): ReferencedTable<T> {
  return new BaseReferenceTable(dbTable, alias) as ReferencedTable<T>;
}
