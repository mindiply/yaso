export interface ITableFieldDefinition {
  dbName: string;
  name: string;
  isEncrypted?: boolean;
  isHash?: boolean;
  isPwHash?: boolean;
  isCC?: boolean;
  isInsertTimestamp?: boolean;
  isUpdateTimestamp?: boolean;
}

export interface ITableField extends ITableFieldDefinition {
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface ITableDefinition<DataType> {
  dbName: string;
  name: string;
  fields: ITableFieldDefinition[];
}

export interface ITable<DataType> extends ITableDefinition<DataType> {
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
}
