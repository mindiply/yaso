import {
  selectFrom,
  ITableDefinition,
  DBTable,
  and,
  equals,
  moreThan,
  or,
  prm,
  tbl,
  usePg
} from '../src';

usePg();

describe('Basic select queries', () => {
  const tblDef: ITableDefinition<ITst> = {
    name: 'Test',
    dbName: 'tst',
    fields: [
      {
        name: '_id',
        dbName: 'tst_id'
      },
      {
        name: 'name',
        dbName: 'tst_name'
      },
      {
        name: 'cc',
        dbName: 'tst_cc',
        isCC: true
      }
    ]
  };
  interface ITst {
    _id: string;
    name: string;
    cc: number;
  }
  const tstTbl = new DBTable<ITst>(tblDef);

  test('should be a select *', () => {
    const sql = selectFrom(tstTbl).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_name as "name",
  tst.tst_cc as "cc"
from tst`;
    expect(sql).toBe(expectedSql);
  });

  const tstTbl2 = tbl(tstTbl, 'tst2');
  test('should be a select * of 2 tables', () => {
    const sql = selectFrom([tstTbl, tstTbl2], (qry, tst, tst2) =>
      qry.join(tst._id, tst2._id)
    ).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_name as "name",
  tst.tst_cc as "cc",
  tst2.tst_id as "_id",
  tst2.tst_name as "name",
  tst2.tst_cc as "cc"
from tst join tst as "tst2" on tst.tst_id = tst2.tst_id`;
    expect(sql).toBe(expectedSql);
  });

  test('should work with cross join', () => {
    const sql = selectFrom([tstTbl, tstTbl2], (qry, tst1, tst2) =>
      qry.fields([tst1._id, tst2.name])
    ).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst2.tst_name as "name"
from
  tst,
  tst as "tst2"`;
    expect(sql).toBe(expectedSql);
  });

  test('simmple where by id clause', () => {
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_cc as "cc"
from tst
where tst.tst_id = $[tstId]`;
    const sql = selectFrom(tstTbl, (qry, tst) =>
      qry.fields([tst._id, tst.cc]).where(equals(tst._id, prm('tstId')))
    ).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Multiple conditions', () => {
    const expectedSql = `select t1.tst_id as "_id"
from tst as "t1"
where
  t1.tst_id = $[_id]
  and (
    t1.tst_name = 'Paolo'
    or t1.tst_id > 20
  )`;
    const sql = selectFrom(tbl(tstTbl, 't1'), (qry, t1) => {
      qry
        .fields(t1._id)
        .where(
          and([
            equals(t1._id, prm('_id')),
            or([equals(t1.name, 'Paolo'), moreThan(t1._id, 20)])
          ])
        );
    }).toString();
    expect(sql).toBe(expectedSql);
  });
});
