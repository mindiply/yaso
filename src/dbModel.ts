import {
  ITable,
  ITableDefinition,
  ITableField,
  ITableFieldDefinition
} from './dbTypes';

const ccRE = /_cc$/i;
const createdAtRE = /_created_at$/i;
const updatedAtRE = /_updated_at$/i;

const tableRegistryByName: Map<string, IDBTable<any>> = new Map();
const tableRegistryByDbName: Map<string, IDBTable<any>> = new Map();

export interface IDBField<T> extends ITableField<T> {
  readonly name: keyof T;
  dbName: string;
  isEncrypted: boolean;
  isHash: boolean;
  isPwHash: boolean;
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export class DBField<T> implements ITableField<T> {
  public readonly name: keyof T;
  public readonly dbName: string;
  public readonly isEncrypted: boolean;
  public readonly isHash: boolean;
  public readonly isPwHash: boolean;
  public readonly isCC: boolean;
  public readonly isInsertTimestamp: boolean;
  public readonly isUpdateTimestamp: boolean;

  constructor(def: ITableFieldDefinition<T>) {
    this.name = def.name;
    this.dbName = def.dbName;
    this.isEncrypted = def.isEncrypted || false;
    this.isHash = def.isHash || false;
    this.isPwHash = def.isPwHash || false;
    this.isCC = def.isCC || ccRE.test(def.dbName);
    this.isInsertTimestamp =
      def.isInsertTimestamp || createdAtRE.test(def.dbName);
    this.isUpdateTimestamp =
      def.isUpdateTimestamp || updatedAtRE.test(def.dbName);
  }
}

export interface IDBTable<DataType = any> extends ITable<DataType> {
  name: string;
  dbName: string;
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
  fields: IDBField<DataType>[];
  ccField?: IDBField<DataType>;
  insertTimestampField?: IDBField<DataType>;
  updateTimestampField?: IDBField<DataType>;
  getFieldByName: (
    fieldName: keyof DataType
  ) => ITableFieldDefinition<DataType> | undefined;
  getFieldByDbName: (
    fieldDbName: string
  ) => ITableFieldDefinition<DataType> | undefined;
}

export class DBTable<DataType = any> implements IDBTable<DataType> {
  public readonly name: string;
  public readonly dbName: string;
  public readonly hasCC: boolean;
  public readonly hasInsertTimestamp: boolean;
  public readonly hasUpdateTimestamp: boolean;
  public readonly fields: IDBField<DataType>[];
  public readonly ccField?: IDBField<DataType>;
  public readonly insertTimestampField?: IDBField<DataType>;
  public readonly updateTimestampField?: IDBField<DataType>;

  protected readonly fieldsByDBName: Map<string, IDBField<DataType>>;
  protected readonly fieldsByName: Map<keyof DataType, IDBField<DataType>>;

  constructor(def: ITableDefinition<DataType>) {
    this.name = def.name;
    this.dbName = def.dbName;
    this.fields = def.fields.map(field => new DBField(field));
    this.fieldsByDBName = new Map();
    this.fieldsByName = new Map();
    this.fields.forEach(dbField => {
      this.fieldsByName.set(dbField.name, dbField);
      this.fieldsByDBName.set(dbField.dbName, dbField);
    });
    const ccIndex = this.fields.findIndex(field => field.isCC);
    this.hasCC = ccIndex !== -1;
    if (this.hasCC) {
      this.ccField = this.fields[ccIndex];
    }
    const insertTimestampIndex = this.fields.findIndex(
      field => field.isInsertTimestamp
    );
    this.hasInsertTimestamp = insertTimestampIndex !== -1;
    if (this.hasInsertTimestamp) {
      this.insertTimestampField = this.fields[insertTimestampIndex];
    }
    const updateTimestampIndex = this.fields.findIndex(
      field => field.isUpdateTimestamp
    );
    this.hasUpdateTimestamp = updateTimestampIndex !== -1;
    if (this.hasUpdateTimestamp) {
      this.updateTimestampField = this.fields[updateTimestampIndex];
    }
    tableRegistryByName.set(this.name, this as IDBTable<DataType>);
    tableRegistryByDbName.set(this.dbName, this as IDBTable<DataType>);
  }

  public getFieldByName = (
    fieldName: keyof DataType
  ): ITableFieldDefinition<DataType> | undefined => {
    return this.fieldsByName.get(fieldName);
  };

  public getFieldByDbName = (
    fieldDbName: string
  ): ITableFieldDefinition<DataType> | undefined => {
    return this.fieldsByDBName.get(fieldDbName);
  };
}

export const createDBTbl = <T>(tblDef: ITableDefinition<T>): IDBTable<T> => {
  const dbTable: IDBTable<T> = new DBTable<T>(tblDef);
  tableRegistryByName.set(dbTable.name, dbTable);
  tableRegistryByDbName.set(dbTable.dbName, dbTable);
  return dbTable;
};

export const isDBTable = <T>(obj: DBTable<T> | any): obj is IDBTable<T> =>
  obj && obj instanceof DBTable;

export function getDbTableByName<T>(tableName: string): IDBTable<T> {
  const tbl = tableRegistryByName.get(tableName);
  if (!tbl) {
    throw new Error('Table not in registry');
  }
  return tbl;
}

export function getDbTableByDbName<T>(tableDbName: string): IDBTable<T> {
  const tbl = tableRegistryByDbName.get(tableDbName);
  if (!tbl) {
    throw new Error('Table not in registry');
  }
  return tbl;
}
