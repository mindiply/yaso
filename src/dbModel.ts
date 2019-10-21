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

  private readonly fieldsByDBName: Map<string, DBField>;
  private readonly fieldsByName: Map<string, DBField>;
  private readonly ccField?: DBField;
  private readonly insertTimestampField?: DBField;
  private readonly updateTimestampField?: DBField;

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
    this.hasCC = this.fields.findIndex(field => field.isCC) !== -1;
    if (this.hasCC) {
      this.ccField = this.fields[this.fields.findIndex(field => field.isCC)];
    }
    this.hasInsertTimestamp =
      this.fields.findIndex(field => field.isInsertTimestamp) !== -1;
    if (this.hasInsertTimestamp) {
      this.insertTimestampField = this.fields[
        this.fields.findIndex(field => field.isInsertTimestamp)
      ];
    }
    this.hasUpdateTimestamp =
      this.fields.findIndex(field => field.isUpdateTimestamp) !== -1;
    if (this.hasUpdateTimestamp) {
      this.updateTimestampField = this.fields[
        this.fields.findIndex(field => field.isUpdateTimestamp)
      ];
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

  public insertQueryForFields = ({
    fieldNames,
    withReturnFields = true
  }: {
    fieldNames: string[];
    updatedCCFields?: boolean;
    withReturnFields?: boolean;
  }): string => {
    const fields: DBField[] = this.mapFieldsNamesToFields(fieldNames);
    if (this.ccField && fields.findIndex(field => field.isCC) === -1) {
      fields.push(this.ccField);
    }
    if (
      this.updateTimestampField &&
      fields.findIndex(field => field.isUpdateTimestamp) === -1
    ) {
      fields.push(this.updateTimestampField);
    }
    if (
      this.insertTimestampField &&
      fields.findIndex(field => field.isInsertTimestamp) === -1
    ) {
      fields.push(this.insertTimestampField);
    }
    return "";
    // return `
    //     insert into ${this.dbName} (
    //         ${fields.map(field => field.sqlInsertField()).join(',\n')}
    //     ) values (
    //         ${fields.map(field => field.sqlInsertValue()).join(',\n')}
    //     )${withReturnFields ? `returning ${this.sqlSelectFields()}` : ''}
    //  `;
  };

  public updateQueryForFields = ({
    fieldNames,
    withReturnFields = true
  }: {
    fieldNames: string[];
    updateCCFields?: boolean;
    withReturnFields?: boolean;
  }): string => {
    const fieldsToUpdate: DBField[] = this.mapFieldsNamesToFields(fieldNames);
    if (this.ccField && fieldsToUpdate.findIndex(field => field.isCC) === -1) {
      fieldsToUpdate.push(this.ccField);
    }
    if (
      this.updateTimestampField &&
      fieldsToUpdate.findIndex(field => field.isUpdateTimestamp) === -1
    ) {
      fieldsToUpdate.push(this.updateTimestampField);
    }
    // const fieldsUpdates = fieldsToUpdate
    //   .map(fieldToUpdate => fieldToUpdate.sqlUpdateField())
    //   .join(',\n');
    // return `
    //   update ${this.dbName}
    //   set
    //     ${fieldsUpdates}
    //   where
    //     ${this.dbName}_id = $[${this.dbName.toLowerCase()}Id]${
    //   withReturnFields
    //     ? `
    //     returning
    //       ${this.sqlSelectFields()}
    //   `
    //     : ''
    // }
    // `;
    return "";
  };

  private mapFieldsNamesToFields = (fieldNames: string[]): DBField[] =>
    fieldNames
      .filter(fieldName => this.fieldsByName.has(fieldName))
      .map(fieldName => this.fieldsByName.get(fieldName)!);
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
