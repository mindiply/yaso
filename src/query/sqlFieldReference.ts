import {DBField} from '../dbModel';
import {ReferencedSelectTable} from './sqlQuery';
import {ReferencedTable} from './sqlTableQuery';
import {ISQLExpression} from './SQLExpression'

export interface IFieldReference<T = any> extends ISQLExpression{
  field: DBField;
  qryTbl: ReferencedSelectTable<T> | ReferencedTable<T>;
  alias?: string;
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
  public field: DBField;
  public qryTbl: ReferencedSelectTable<T> | ReferencedTable<T>;
  public alias?: string;

  constructor(
    qryTbl: ReferencedSelectTable<T> | ReferencedTable<T>,
    field: DBField,
    alias?: string
  ) {
    this.field = field;
    this.qryTbl = qryTbl;
    if (alias) {
      this.alias = alias;
    }
  }

  public isSimpleValue = () => true;

  public toSql = () => this.toReferenceSql();

  public toSelectSql = (): string => {
    const {name} = this.field;
    return `${this.readValueToSql()} as "${
      this.alias ? this.alias : name
    }"`;
  };

  public toReferenceSql = (): string =>
    `${this.qryTbl.toReferenceSql()}.${this.field.dbName}`;

  public toInsertSqlField = (): string => this.field.dbName;

  public readValueToSql = (value?: ISQLExpression): string => {
    const {isEncrypted} = this.field;
    const strVal = value ? value.toSql() : this.toReferenceSql();

    return `${isEncrypted ? `${this.decryptField(strVal)}` : strVal}`;
  };

  public writeValueToSQL = (value: ISQLExpression | undefined, isInsert = false): string => {
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
      ? this.encryptField(strVal)
      : isHash
      ? this.hashField(strVal)
      : isPwHash
      ? this.hashPwField(strVal)
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
