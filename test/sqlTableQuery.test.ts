import {
  ITableDefinition,
  tbl,
  insertQuerySql,
  and,
  equals,
  moreThan,
  prm,
  usePg,
  or,
  isNull,
  tableSelectSql,
  count,
  alias,
  updateQuerySql,
  max,
  createDBTbl,
  getDbTableByDbName,
  moreOrEqual,
  selectFrom,
  deleteQuerySql,
  castAs,
  concat,
  exists,
  value,
  min,
  caseWhen,
  sqlNull,
  mod
} from '../src';

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
  const tstDbTbl = createDBTbl(tblDef);
  test('Basic update', () => {
    const sql = updateQuerySql(tstDbTbl, qryTbl => ({
      fields: {name: prm('newName')},
      where: equals(qryTbl._id, prm('_id'))
    }));
    const expectedSql = `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = encode(pgp_sym_encrypt($[newName], $[encryptionKey]), 'hex'),
  tst_updated_at = current_timestamp
where tst.tst_id = $[_id]`;
    expect(sql).toBe(expectedSql);
  });
  test('Update 2 fields', () => {
    const sql = updateQuerySql(tstDbTbl, qryTbl => ({
      fields: {name: prm('name'), normal: 'normalValue'},
      where: and([equals(qryTbl._id, 18), moreThan(qryTbl.cc, 3)])
    }));
    const expectedSql = `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = encode(pgp_sym_encrypt($[name], $[encryptionKey]), 'hex'),
  tst_normal = 'normalValue',
  tst_updated_at = current_timestamp
where
  tst.tst_id = 18
  and tst.tst_cc > 3`;

    expect(sql).toBe(expectedSql);
  });

  test('Update 2 fields and return all of them', () => {
    const sql = updateQuerySql(tstDbTbl, qryTbl => ({
      fields: {name: prm('name'), normal: 'normalValue'},
      where: and([equals(qryTbl._id, 18), moreThan(qryTbl.cc, 3)]),
      returnFields: true
    }));
    const expectedSql = `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = encode(pgp_sym_encrypt($[name], $[encryptionKey]), 'hex'),
  tst_normal = 'normalValue',
  tst_updated_at = current_timestamp
where
  tst.tst_id = 18
  and tst.tst_cc > 3
returning
  tst.tst_id as "_id",
  tst.tst_cc as "cc",
  case when tst.tst_name is not null then pgp_sym_decrypt(decode(tst.tst_name, 'hex'), $[encryptionKey]) else null end as "name",
  tst.tst_normal as "normal",
  tst.tst_updated_at as "updatedAt"`;

    expect(sql).toBe(expectedSql);
  });
});

describe('Testing insert queries', () => {
  interface INoUpdateTbl {
    id: number;
    description: string;
    when: Date;
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
  const nupTbl = createDBTbl(noUpdateTblDef);

  test('Insert single field, no updates', () => {
    const expectedSql = `insert into nup (descr) values ($[fullName])`;
    const sql = insertQuerySql(nupTbl, {
      fields: {description: prm('fullName')}
    });
    expect(sql).toBe(expectedSql);
  });

  test('Insert single field, no updates, returning one field', () => {
    const expectedSql = `insert into nup (descr) values ($[fullName])
returning nup.descr as "description"`;
    const sql = insertQuerySql(nupTbl, {
      fields: {description: prm('fullName')},
      returnFields: ['description']
    });
    expect(sql).toBe(expectedSql);
  });

  interface IUpdateTbl {
    id: number;
    description: string;
    when: Date;
  }
  const updateTblDef: ITableDefinition<IUpdateTbl> = {
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
      },
      {
        name: 'when',
        dbName: 'inserted_on',
        isInsertTimestamp: true
      }
    ]
  };
  const upTbl = createDBTbl(updateTblDef);

  test('Insert multiple fields, no updates', () => {
    const expectedSql = `insert into nup (
  descr,
  id,
  inserted_on
) values (
  'Paolo',
  10,
  current_timestamp
)`;
    const sql = insertQuerySql(upTbl, {fields: {id: 10, description: 'Paolo'}});
    expect(sql).toBe(expectedSql);
  });
  test('Insert multiple fields, no updates, returning all fields', () => {
    const expectedSql = `insert into nup (
  descr,
  id,
  inserted_on
) values (
  'Paolo',
  10,
  current_timestamp
)
returning
  nup.descr as "description",
  nup.id as "id",
  nup.inserted_on as "when"`;
    const sql = insertQuerySql(upTbl, {
      fields: {id: 10, description: 'Paolo'},
      returnFields: true
    });
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
    const expectedSql = `select tst.tst_id as "id" from tst`;
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

  test('One aggregate field, one simple condition', () => {
    const expectedSql = `select count(1) as "nTst" from tst where tst.tst_id = 'idtest'`;
    const sql = tableSelectSql(qryTbl, tst => ({
      fields: [alias(count(1), 'nTst')],
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

  test('Subquery on same table and auto alias', () => {
    const expectedSql = `select
  tst.tst_change_count as "cc",
  tst.tst_id as "id",
  tst.tst_name as "name",
  tst.tst_created_at as "when"
from tst
where
  tst.tst_id =
    (select max(tst2.tst_id) from tst as "tst2" where tst2.tst_name = $[name])`;
    const sql = qryTbl
      .selectQry(tst => ({
        where: equals(
          tst.id,
          selectFrom(getDbTableByDbName<ITest>('tst'), (qry, tst2) => {
            qry.fields(max(tst2.id)).where(equals(tst2.name, prm('name')));
          })
        )
      }))
      .toSql();
    expect(sql).toBe(expectedSql);
  });

  test('case expression', () => {
    const sql = qryTbl.selectQrySql({
      fields: [
        caseWhen(
          [
            {
              condition: equals(mod(qryTbl.id, 2), 0),
              then: 'even'
            }
          ],
          value('odd')
        )
      ]
    });
    expect(sql).toBe(`select case when tst.tst_id % 2 = 0 then 'even' else 'odd' end from tst`);
  });

  test('multi case expression', () => {
    const sql = qryTbl.selectQrySql({
      fields: [
        caseWhen(
          [
            {
              condition: equals(mod(qryTbl.id, 4), 0),
              then: 'div 4 rest 0'
            },
            {
              condition: equals(mod(qryTbl.id, 4), 1),
              then: 'div 4 rest 1'
            },
            {
              condition: equals(mod(qryTbl.id, 4), 2),
              then: 'div 4 rest 2'
            },
            {
              condition: equals(mod(qryTbl.id, 4), 3),
              then: 'div 4 rest 3'
            }
          ],
          value('this is utterly, utterly unexpected boss')
        )
      ]
    });
    expect(sql).toBe(`select
  case
    when tst.tst_id % 4 = 0 then 'div 4 rest 0'
    when tst.tst_id % 4 = 1 then 'div 4 rest 1'
    when tst.tst_id % 4 = 2 then 'div 4 rest 2'
    when tst.tst_id % 4 = 3 then 'div 4 rest 3'
    else 'this is utterly, utterly unexpected boss'
  end
from tst`);
  });

  test('Exists and cast operators on simple select', () => {
    const sql = qryTbl.selectQrySql(tst => ({
      fields: [
        alias(
          castAs(concat('{"maxId":"', concat(min(tst.id), '"}')), 'jsonb'),
          'json'
        )
      ],
      where: exists(
        tbl(qryTbl.tbl).selectQry(tst2 => ({
          fields: [value(1)],
          where: moreThan(tst2.id, tst.id)
        }))
      )
    }));
    expect(sql).toBe(
      `select cast('{"maxId":"' || min(tst.tst_id) || '"}' as jsonb) as "json"
from tst
where exists (select 1 from tst as "tst2" where tst2.tst_id > tst.tst_id)`
    );
  });
});

describe('Select, insert and update with encrypted and hashed fields', () => {
  interface IEHTst {
    id: string;
    name: string;
    pwHash: string;
    nameDigest: string;
    description: string;
  }
  const tstDef: ITableDefinition<IEHTst> = {
    name: 'EncryptionHashingTest',
    dbName: 'enc',
    fields: [
      {
        dbName: 'id',
        name: 'id'
      },
      {
        dbName: 'name',
        name: 'name',
        isEncrypted: true
      },
      {
        dbName: 'pw_hash',
        name: 'pwHash',
        isPwHash: true
      },
      {
        dbName: 'name_digest',
        name: 'nameDigest',
        isHash: true
      },
      {
        dbName: 'description',
        name: 'description'
      }
    ]
  };
  const tstQry = tbl(tstDef);
  test('select encrypted and where on hashed', () => {
    const expectdSql = `select case when enc.name is not null then pgp_sym_decrypt(decode(enc.name, 'hex'), $[encryptionKey]) else null end as "name"
from enc
where enc.pw_hash = crypt($[pw], enc.pw_hash)
order by enc.name`;
    const sql = tstQry.selectQrySql({
      fields: ['name'],
      where: equals(tstQry.pwHash, tstQry.pwHash().readValueToSql(prm('pw'))),
      orderByFields: [{field: tstQry.name}]
    });
    expect(sql).toBe(expectdSql);
  });
});

describe('Delete queries', () => {
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

  test('basic delete', () => {
    expect(deleteQuerySql(qryTbl)).toBe('delete from tst');
  });

  test('delete with some conditions', () => {
    expect(
      deleteQuerySql(qryTbl, {
        where: and([
          equals(qryTbl.name, prm('name')),
          moreOrEqual(qryTbl.cc, 2)
        ])
      })
    ).toBe(`delete from tst
where
  tst.tst_name = $[name]
  and tst.tst_change_count >= 2`);
  });
});
