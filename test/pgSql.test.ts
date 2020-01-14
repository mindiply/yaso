import {
  selectFrom,
  ITableDefinition,
  and,
  equals,
  moreThan,
  or,
  prm,
  tbl,
  usePg,
  min,
  alias,
  rawSql,
  createDBTbl,
  nullValue,
  value,
  max
} from '../src';

usePg();

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
const tstTbl = createDBTbl(tblDef);

describe('Sql expressions in isolation', () => {
  test('nvl with numeric values on one line', () => {
    const expectedResult = 'coalesce(2, 1)';
    expect(nullValue(value(2), value(1)).toSql()).toBe(expectedResult);
  });

  test('nvl with sql statement and value on multiple lines', () => {
    const expectedResult = `coalesce(
  select max(tst.tst_id) from tst where tst.tst_name = $[name],
  1
)`;
    expect(
      nullValue(
        selectFrom(tstTbl, (qry, tst) => {
          qry.fields([max(tst._id)]).where(equals(tst.name, prm('name')));
        }),
        value(1)
      ).toSql()
    ).toBe(expectedResult);
  });
});

describe('Basic select queries', () => {
  test('should be a select *', () => {
    const sql = selectFrom(tstTbl).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_cc as "cc",
  tst.tst_name as "name"
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
  tst2.tst_id as "_id",
  tst.tst_cc as "cc",
  tst2.tst_cc as "cc",
  tst.tst_name as "name",
  tst2.tst_name as "name"
from tst join tst as "tst2" on tst.tst_id = tst2.tst_id`;
    expect(sql).toBe(expectedSql);
  });

  test('should work with cross product', () => {
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
  )
order by t1.tst_id desc`;
    const sql = selectFrom(tbl(tstTbl, 't1'), (qry, t1) => {
      qry
        .fields(t1._id)
        .where(
          and([
            equals(t1._id, prm('_id')),
            or([equals(t1.name, 'Paolo'), moreThan(t1._id, 20)])
          ])
        )
        .orderBy([{field: t1._id, isDesc: true}]);
    }).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Multiple conditions', () => {
    const expectedSql = `select
  t1.tst_id as "_id",
  (
    select min(tst.tst_id)
    from tst
    where
      tst.tst_id > t1.tst_id
      and t1.tst_name = tst.tst_name
  ) as "sameNameId"
from tst as "t1"
where
  t1.tst_id = $[_id]
  and (
    t1.tst_name = 'Paolo'
    or t1.tst_id > 20
  )
order by
  t1.tst_id,
  "sameNameId" desc`;
    const sql = selectFrom(tbl(tstTbl, 't1'), (qry, t1) => {
      qry
        .fields([
          t1._id,
          alias(
            selectFrom(tstTbl, (qry, t2) => {
              qry
                .fields(min(t2._id))
                .where(
                  and([moreThan(t2._id, t1._id), equals(t1.name, t2.name)])
                );
            }),
            'sameNameId'
          )
        ])
        .where(
          and([
            equals(t1._id, prm('_id')),
            or([equals(t1.name, 'Paolo'), moreThan(t1._id, 20)])
          ])
        )
        .orderBy([
          {field: t1._id},
          {field: rawSql('"sameNameId"', true), isDesc: true}
        ]);
    }).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Multiple conditions with limit', () => {
    const expectedSql = `select
  t1.tst_id as "_id",
  (
    select min(tst.tst_id)
    from tst
    where
      tst.tst_id > t1.tst_id
      and t1.tst_name = tst.tst_name
  ) as "sameNameId"
from tst as "t1"
where
  t1.tst_id = $[_id]
  and (
    t1.tst_name = 'Paolo'
    or t1.tst_id > 20
  )
order by
  t1.tst_id,
  "sameNameId" desc
limit 10`;
    const sql = selectFrom(tbl(tstTbl, 't1'), (qry, t1) => {
      qry
        .fields([
          t1._id,
          alias(
            selectFrom(tstTbl, (qry, t2) => {
              qry
                .fields(min(t2._id))
                .where(
                  and([moreThan(t2._id, t1._id), equals(t1.name, t2.name)])
                );
            }),
            'sameNameId'
          )
        ])
        .where(
          and([
            equals(t1._id, prm('_id')),
            or([equals(t1.name, 'Paolo'), moreThan(t1._id, 20)])
          ])
        )
        .orderBy([
          {field: t1._id},
          {field: rawSql('"sameNameId"', true), isDesc: true}
        ])
        .maxRows(10);
    }).toString();
    expect(sql).toBe(expectedSql);
  });
});
