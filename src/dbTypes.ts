export interface ITableFieldDefinition<DataType> {
  dbName: string;
  name: keyof DataType;
  isEncrypted?: boolean;
  isHash?: boolean;
  isPwHash?: boolean;
  isCC?: boolean;
  isInsertTimestamp?: boolean;
  isUpdateTimestamp?: boolean;
}

export interface ITableField<T> extends ITableFieldDefinition<T> {
  isCC: boolean;
  isInsertTimestamp: boolean;
  isUpdateTimestamp: boolean;
}

export interface ITableDefinition<DataType> {
  dbName: string;
  name: string;
  fields: ITableFieldDefinition<DataType>[];
}

export interface ITable<DataType> extends ITableDefinition<DataType> {
  hasCC: boolean;
  hasInsertTimestamp: boolean;
  hasUpdateTimestamp: boolean;
}
