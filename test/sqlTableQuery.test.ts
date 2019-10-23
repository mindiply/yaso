import {
  ITableDefinition,
  DBTable,
  tbl,
  insertQuerySql,
  and,
  equals,
  moreThan,
  prm,
  usePg,
  or,
  isNull
} from '../src';
import {tableSelectSql} from '../src/query/sqlTableQuery';

usePg();

interface ITestTbl {
  _id: number;
  name: string;
  normal: string;
  cc: number;
  updatedAt: Date;
}

describe('Testing table update queries', () => {
  const tblDef: ITableDefinition<ITestTbl> = {
    name: 'test',
    dbName: 'tst',
    fields: [
      {
        name: '_id',
        dbName: 'tst_id'
      },
      {
        name: 'name',
        dbName: 'tst_name',
        isEncrypted: true
      },
      {
        name: 'normal',
        dbName: 'tst_normal'
      },
      {
        name: 'cc',
        dbName: 'tst_cc',
        isCC: true
      },
      {
        name: 'updatedAt',
        dbName: 'tst_updated_at',
        isUpdateTimestamp: true
      }
    ]
  };
  const tstDbTbl = new DBTable(tblDef);
  const qryTbl = tbl(tstDbTbl);
  test('Basic update', () => {
    const sql = qryTbl.updateQrySql(
      {name: prm('newName')},
      equals(qryTbl._id, prm('_id'))
    );
    console.log(sql);
    const expectedSql = `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = encode(pgp_sym_encrypt($[newName], $[encryptionKey]), 'hex')
where tst.tst_id = $[_id]`;
    expect(sql).toBe(expectedSql);
  });
  test('Update 2 fields', () => {
    const sql = qryTbl.updateQrySql(
      {name: prm('name'), normal: 'normalValue'},
      and([equals(qryTbl._id, 18), moreThan(qryTbl.cc, 3)])
    );
    const expectedSql = `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = encode(pgp_sym_encrypt($[name], $[encryptionKey]), 'hex'),
  tst_normal = 'normalValue'
where
  tst.tst_id = 18
  and tst.tst_cc > 3`;

    expect(sql).toBe(expectedSql);
  });
});

describe('Testing insert queries', () => {
  interface INoUpdateTbl {
    id: number;
    description: string;
  }
  const noUpdateTblDef: ITableDefinition<INoUpdateTbl> = {
    name: 'noupdate',
    dbName: 'nup',
    fields: [
      {
        name: 'id',
        dbName: 'id'
      },
      {
        name: 'description',
        dbName: 'descr'
      }
    ]
  };
  const nupTbl = new DBTable(noUpdateTblDef);

  test('Insert single field, no updates', () => {
    const expectedSql = `insert into nup (descr) values ($[fullName])`;
    const sql = insertQuerySql(nupTbl, {description: prm('fullName')});
    expect(sql).toBe(expectedSql);
  });

  test('Insert multiple fields, no updates', () => {
    const expectedSql = `insert into nup (
  descr,
  id
) values (
  'Paolo',
  10
)`;
    const sql = insertQuerySql(nupTbl, {id: 10, description: 'Paolo'});
    expect(sql).toBe(expectedSql);
  });
});

describe('Test table select queries', () => {
  interface ITest {
    id: string;
    name: string;
    when: Date;
    cc: number;
  }
  const tstDef: ITableDefinition<ITest> = {
    name: 'Test',
    dbName: 'tst',
    fields: [
      {
        name: 'id',
        dbName: 'tst_id'
      },
      {
        name: 'name',
        dbName: 'tst_name'
      },
      {
        name: 'when',
        dbName: 'tst_created_at',
        isInsertTimestamp: true
      },
      {
        name: 'cc',
        dbName: 'tst_change_count',
        isCC: true
      }
    ]
  };
  const qryTbl = tbl(tstDef);
  test('Simple single field, no condition query', () => {
    const expectedSql = `select tst.tst_id as "id"
from tst`;
    const sql = tableSelectSql(qryTbl, {fields: ['id']});
    expect(sql).toBe(expectedSql);
  });

  test('Two fields, one simple condition', () => {
    const expectedSql = `select
  tst.tst_name as "name",
  tst.tst_created_at as "when"
from tst
where tst.tst_id = 'idtest'`;
    const sql = tableSelectSql(qryTbl, tst => ({
      fields: ['name', 'when'],
      where: equals(tst.id, 'idtest')
    }));
    expect(sql).toBe(expectedSql);
  });

  test('All fields, multiple conditions', () => {
    const expectedSql = `select
  tst.tst_change_count as "cc",
  tst.tst_id as "id",
  tst.tst_name as "name",
  tst.tst_created_at as "when"
from tst
where
  tst.tst_id = $[id]
  or tst.tst_id is null`;
    const sql = tableSelectSql(qryTbl, tst => ({
      where: or([equals(tst.id, prm('id')), isNull(tst.id)])
    }));
    expect(sql).toBe(expectedSql);
  });
});
