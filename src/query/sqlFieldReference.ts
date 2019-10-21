import { DBField } from "../dbModel";
import { ReferencedSelectTable } from "./sqlQuery";
import { NamedParameter, WhereCondBinaryValue } from "./sqlWhere";

export interface IFieldReference<T = any> {
  field: DBField;
  qryTbl: ReferencedSelectTable<T>;
  alias?: string;
  toSelectSql: () => string;
  toReferenceSql: () => string;
  valueToSql: (val: WhereCondBinaryValue) => string;
}

export type IFieldReferenceFn<T = any> = (
  newAlias?: string
) => IFieldReference<T>;

export class FieldReference<T> implements IFieldReference {
  public field: DBField;
  public qryTbl: ReferencedSelectTable<T>;
  public alias?: string;

  constructor(
    qryTbl: ReferencedSelectTable<T>,
    field: DBField,
    alias?: string
  ) {
    this.field = field;
    this.qryTbl = qryTbl;
    if (alias) {
      this.alias = alias;
    }
  }

  public toSelectSql = (): string => {
    const { isEncrypted, dbName, name } = this.field;
    const fieldRef = this.toReferenceSql();
    return `${isEncrypted ? this.decryptField(fieldRef) : fieldRef} as "${
      this.alias ? this.alias : name
    }"`;
  };

  public toReferenceSql = (): string =>
    `${this.qryTbl.toReferenceSql()}.${this.field.dbName}`;

  public toInsertSqlField = (): string => this.field.dbName;

  public toWhereFieldValue = (value: WhereCondBinaryValue): string => {
    const { isEncrypted, isHash, isPwHash } = this.field;
    const strVal = this.valueToSql(value);

    return `${
      isEncrypted
        ? `encode(pgp_sym_encrypt(${strVal}, 'hex'), $[decryptionKey])`
        : isHash
        ? `encode(digest($[${strVal}], 'sha512'), 'hex')`
        : isPwHash
        ? `crypt(${strVal}, ${this.fieldReferenceSql()})`
        : strVal
    }`;
  };

  public toInsertValueSql = (value: WhereCondBinaryValue): string => {
    const {
      isCC,
      isEncrypted,
      isInsertTimestamp,
      isUpdateTimestamp,
      isPwHash,
      isHash,
      dbName,
      name
    } = this.field;
    const strVal = this.valueToSql(value);
    return isEncrypted
      ? `encode(pgp_sym_encrypt(${strVal}, $[encryptionKey]), 'hex')`
      : isHash
      ? `encode(digest(${strVal}, 'sha512'), 'hex')`
      : isCC
      ? "0"
      : isInsertTimestamp || isUpdateTimestamp
      ? "current_timestamp"
      : strVal;
  };

  public toUpdateValueSql = (value: WhereCondBinaryValue): string => {
    const {
      isCC,
      isEncrypted,
      isHash,
      isInsertTimestamp,
      isPwHash,
      isUpdateTimestamp,
      dbName
    } = this.field;
    const strVal = this.valueToSql(value);
    return isEncrypted
      ? `encode(pgp_sym_encrypt(${strVal}, $[encryptionKey]), 'hex')`
      : isHash
      ? `encode(digest(${strVal}, 'sha512'), 'hex')`
      : isCC
      ? `${strVal} + 1`
      : isUpdateTimestamp
      ? "current_timestamp"
      : isInsertTimestamp
      ? this.fieldReferenceSql()
      : strVal;
  };

  public fieldReferenceSql = (): string =>
    `${this.qryTbl.alias}.${this.field.dbName}`;

  public toUpdateFieldSql = (value: WhereCondBinaryValue): string => {
    return `${this.fieldReferenceSql()} = ${this.toUpdateValueSql(value)}`;
  };

  public valueToSql = (value: WhereCondBinaryValue): string => {
    if (value instanceof NamedParameter) {
      return value.toSql();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof FieldReference) {
      return value.toSelectSql();
    }
    return String(value);
  };

  protected encryptField = (fldText: string): string => fldText;

  protected decryptField = (fldText: string): string => fldText;
}
