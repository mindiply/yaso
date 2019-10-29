import {DBField} from '../dbModel';
import {ReferencedTable} from './sqlTableQuery';
import {ISQLExpression} from './SQLExpression';

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
    const {isEncrypted} = this.field;
    const strVal = value ? value.toSql() : this.toReferenceSql();

    return `${isEncrypted ? `${this.decryptField(strVal)}` : strVal}`;
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
  protected now = (): string => 'current_timestamp';
}
