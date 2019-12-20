import {IDBField, IDBTable} from '../dbModel';
import {
  FormattedSqlValueExpression,
  QueryContext,
  rawSql
} from './SQLExpression';
import {
  IFieldReference,
  IFieldReferenceFn,
  IQueryContext,
  ISQLExpression,
  ReferencedTable,
  IToSqlFn
} from './types';
import {dbDialect} from '../db';

class FieldSelectSqlExpression<T> implements ISQLExpression {
  private field: IFieldReference<T>;

  constructor(field: IFieldReference<T>) {
    this.field = field;
  }

  public isSimpleValue = () => true;

  public toSql = (qryContext?: IQueryContext) => {
    return `${this.field.readValueToSql().toSql(qryContext)} as "${
      this.field.alias
    }"`;
  };
}

class FieldToReferenceSqlExpression<T> implements ISQLExpression {
  private field: FieldReference<T>;

  constructor(field: FieldReference<T>) {
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

export class FieldReference<T> implements IFieldReference {
  public field: IDBField<T>;
  public qryTbl: ReferencedTable<T>;
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

function updateFieldFormatFn(fieldStr?: string, valueStr?: string): string {
  return `${fieldStr} = ${valueStr}`;
}

export function createFieldReferenceFn<T>(
  qryTbl: ReferencedTable<T>,
  field: IDBField<T>,
  alias?: string
): IFieldReferenceFn<T> {
  const ref: IFieldReference<T> = new FieldReference(qryTbl, field, alias);
  return (): IFieldReference<T> => {
    return ref;
  };
}

interface IToBooleanFn {
  (): boolean;
}

export class BaseReferenceTable<T = any> implements ISQLExpression {
  [fieldname: string]:
    | IFieldReferenceFn
    | IDBTable<T>
    | string
    | undefined
    | IToSqlFn
    | IToBooleanFn;
  public tbl: IDBTable<T>;
  public alias?: string;

  constructor(tbl: IDBTable<T>, alias?: string) {
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

  public toSql = (qryContext: IQueryContext = new QueryContext()): string => {
    const aliasToUse = this.aliasToUse(qryContext);
    return `${this.tbl.dbName}${
      aliasToUse !== this.tbl.dbName ? ` as "${aliasToUse}"` : ''
    }`;
  };

  public toReferenceSql = (qryContext: IQueryContext): string =>
    this.aliasToUse(qryContext);

  public isSimpleValue = () => true;

  protected aliasToUse = (qryContext: IQueryContext): string => {
    const queryContext = qryContext || new QueryContext();
    let contextAlias = queryContext.tableRefAlias(this as ReferencedTable<T>);
    if (!contextAlias) {
      contextAlias = queryContext.addTable(this as ReferencedTable<T>);
    }
    return contextAlias;
  };
}

export function createReferencedTable<T>(
  dbTable: IDBTable<T>,
  alias?: string
): ReferencedTable<T> {
  return new BaseReferenceTable(dbTable, alias) as ReferencedTable<T>;
}
