import {
  ITable,
  ITableDefinition,
  ITableField,
  ITableFieldDefinition
} from "./dbTypes";

const ccRE = /_cc$/i;
const createdAtRE = /_created_at$/i;
const updatedAtRE = /_cc$/i;

export class DBField implements ITableField {
  public readonly name: string;
  public readonly dbName: string;
  public readonly isEncrypted: boolean;
  public readonly isHash: boolean;
  public readonly isPwHash: boolean;
  public readonly isCC: boolean;
  public readonly isInsertTimestamp: boolean;
  public readonly isUpdateTimestamp: boolean;

  constructor(def: ITableFieldDefinition) {
    this.name = def.name;
    this.dbName = def.dbName;
    this.isEncrypted = def.isEncrypted || false;
    this.isHash = def.isHash || false;
    this.isPwHash = def.isPwHash || false;
    this.isCC = ccRE.test(def.dbName);
    this.isInsertTimestamp = createdAtRE.test(def.dbName);
    this.isUpdateTimestamp = updatedAtRE.test(def.dbName);
  }
}

export class DBTable<DataType = any> implements ITable<DataType> {
  public readonly name: string;
  public readonly dbName: string;
  public readonly hasCC: boolean;
  public readonly hasInsertTimestamp: boolean;
  public readonly hasUpdateTimestamp: boolean;
  public readonly fields: DBField[];
  public readonly ccField?: DBField;
  public readonly insertTimestampField?: DBField;
  public readonly updateTimestampField?: DBField;

  protected readonly fieldsByDBName: Map<string, DBField>;
  protected readonly fieldsByName: Map<string, DBField>;

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
    const ccIndex = this.fields.findIndex(field => field.isCC)
    this.hasCC = ccIndex !== -1;
    if (this.hasCC) {
      this.ccField = this.fields[ccIndex];
    }
    const insertTimestampIndex = this.fields.findIndex(field => field.isInsertTimestamp);
    this.hasInsertTimestamp = insertTimestampIndex !== -1;
    if (this.hasInsertTimestamp) {
      this.insertTimestampField = this.fields[insertTimestampIndex];
    }
    const updateTimestampIndex = this.fields.findIndex(field => field.isUpdateTimestamp);
    this.hasUpdateTimestamp = updateTimestampIndex !== -1;
    if (this.hasUpdateTimestamp) {
      this.updateTimestampField = this.fields[updateTimestampIndex];
    }
    tableRegistryByName.set(this.name, this);
    tableRegistryByDbName.set(this.dbName, this);
  }

  public getFieldByName = (
    fieldName: string
  ): ITableFieldDefinition | undefined => {
    return this.fieldsByName.get(fieldName);
  };

  public getFieldByDbName = (
    fieldDbName: string
  ): ITableFieldDefinition | undefined => {
    return this.fieldsByDBName.get(fieldDbName);
  };
}

export const createDBTbl = <T>(tblDef: ITableDefinition<T>): DBTable<T> => {
  return new DBTable<T>(tblDef);
}

const tableRegistryByName: Map<string, DBTable<any>> = new Map();
const tableRegistryByDbName: Map<string, DBTable<any>> = new Map();

export function getDbTableByName<T>(tableName: string): DBTable<T> {
  const tbl = tableRegistryByName.get(tableName);
  if (!tbl) {
    throw new Error("Table not in registry");
  }
  return tbl;
}

export function getDbTableByDbName<T>(tableDbName: string): DBTable<T> {
  const tbl = tableRegistryByDbName.get(tableDbName);
  if (!tbl) {
    throw new Error("Table not in registry");
  }
  return tbl;
}
