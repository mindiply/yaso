import {
  selectFrom,
  TableDefinition,
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
  max,
  add,
  count,
  aggregateWith,
  concat,
  binaryOperator
} from '../src';

interface ITst {
  _id: string;
  name: string;
  cc: number;
  simpleCF: () => number;
  complexCF: () => number;
  calculation: () => number;
}

usePg();
const tblDef: TableDefinition<ITst> = {
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
  ],
  calculatedFields: [
    {
      name: 'simpleCF',
      dbName: 'simpleCF',
      calculation: tblRef => add(tblRef.cols.cc, tblRef.cols.cc)
    },
    {
      name: 'complexCF',
      dbName: 'complexCF',
      calculation: tblRef =>
        selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
          qry
            .fields(alias(count(tbl2Ref.cols._id), 'count'))
            .where(equals(tbl2Ref.cols.name, tblRef.cols.name));
        })
    },
    {
      name: 'calculation',
      dbName: 'exampleCalculation',
      calculation: tblRef =>
        selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
          qry
            .fields(alias(count(tbl2Ref.cols._id), 'n'))
            .where(equals(tbl2Ref.cols.name, tblRef.cols.name));
        })
    }
  ]
};
const tstTbl = createDBTbl(tblDef);

describe('Sql expressions in isolation', () => {
  test('nvl with numeric values on one line', () => {
    const expectedResult = 'coalesce(2, 1)';
    expect(nullValue(value(2), value(1)).toSql()).toBe(expectedResult);
  });

  test('nvl with sql statement and value on multiple lines', () => {
    const expectedResult = `coalesce(
  (select max(tst.tst_id) as "maxId" from tst where tst.tst_name = $[name]),
  1
)`;
    expect(
      nullValue(
        selectFrom(tstTbl, (qry, tst) => {
          qry
            .fields([alias(max(tst.cols._id), 'maxId')])
            .where(equals(tst.cols.name, prm('name')));
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

  test('custom aggregate operator', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry.fields(alias(aggregateWith('array_agg', tst.cols._id), 'ids'));
    }).toString();
    const expectedSql = `select array_agg(tst.tst_id) as "ids" from tst`;
    expect(sql).toBe(expectedSql);
  });

  test('should select id and simple calculated field', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry
        .fields([tst.cols._id, tst.cols.simpleCF])
        .where(equals(tst.cols.name, prm('name')));
    }).toSql();
    expect(sql).toBe(`select
  tst.tst_id as "_id",
  (tst.tst_cc + tst.tst_cc) as "simpleCF"
from tst
where tst.tst_name = $[name]`);
  });

  test('should select all fields and a simple calculated field', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry
        .fields([tst, tst.cols.simpleCF])
        .where(equals(tst.cols.name, prm('name')));
    }).toSql();
    expect(sql).toBe(`select
  tst.tst_id as "_id",
  tst.tst_cc as "cc",
  tst.tst_name as "name",
  (tst.tst_cc + tst.tst_cc) as "simpleCF"
from tst
where tst.tst_name = $[name]`);
  });

  test('should select id and complex calculated field', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry
        .fields([tst.cols._id, tst.cols.complexCF])
        .where(equals(tst.cols.name, prm('name')));
    }).toSql();
    expect(sql).toBe(`select
  tst.tst_id as "_id",
  (
    select count(tst2.tst_id) as "count"
    from tst as "tst2"
    where tst2.tst_name = tst.tst_name
  ) as "complexCF"
from tst
where tst.tst_name = $[name]`);
  });

  test('Use complex calculated field in where clause', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry.fields(tst.cols._id).where(moreThan(tst.cols.complexCF, 1));
    }).toSql();
    expect(sql).toBe(`select tst.tst_id as "_id"
from tst
where
  (
    select count(tst2.tst_id) as "count"
    from tst as "tst2"
    where tst2.tst_name = tst.tst_name
  ) > 1`);
  });

  const tstTbl2 = tbl(tstTbl, 'tst2');
  test('should be a select * of 2 tables', () => {
    const sql = selectFrom([tstTbl, tstTbl2], (qry, tst, tst2) =>
      qry.join(tst.cols._id, tst2.cols._id)
    ).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst2.tst_id as "_id2",
  tst.tst_cc as "cc",
  tst2.tst_cc as "cc2",
  tst.tst_name as "name",
  tst2.tst_name as "name2"
from tst join tst as "tst2" on tst.tst_id = tst2.tst_id`;
    expect(sql).toBe(expectedSql);
  });

  test('should allow select from inner select', () => {
    const sql = selectFrom(
      selectFrom(tstTbl, (qry, tst) =>
        qry.fields([tst.cols._id]).orderBy([{field: tst.cols.name}])
      ),
      (qry, calcTbl) =>
        qry.fields([alias(aggregateWith('array_agg', calcTbl.cols._id), 'ids')])
    ).toString();
    const expectedSql = `select array_agg("SQ._id") as "ids"
from (select tst.tst_id as "_id" from tst order by tst.tst_name) as "SQ"`;
    expect(sql).toBe(expectedSql);
  });

  test('should work with cross product', () => {
    const sql = selectFrom([tblDef, tblDef], (qry, tst1, tst2) =>
      qry.fields([tst1.cols._id, tst2.cols.name])
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
      qry
        .fields([tst.cols._id, tst.cols.cc])
        .where(equals(tst.cols._id, prm('tstId')))
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
        .fields(t1.cols._id)
        .where(
          and([
            equals(t1.cols._id, prm('_id')),
            or([equals(t1.cols.name, 'Paolo'), moreThan(t1.cols._id, 20)])
          ])
        )
        .orderBy([{field: t1.cols._id, isDesc: true}]);
    }).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Multiple conditions', () => {
    const expectedSql = `select
  t1.tst_id as "_id",
  (
    select min(tst.tst_id) as "minId"
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
          t1.cols._id,
          alias(
            selectFrom(tstTbl, (qry, t2) => {
              qry
                .fields(alias(min(t2.cols._id), 'minId'))
                .where(
                  and([
                    moreThan(t2.cols._id, t1.cols._id),
                    equals(t1.cols.name, t2.cols.name)
                  ])
                );
            }),
            'sameNameId'
          )
        ])
        .where(
          and([
            equals(t1.cols._id, prm('_id')),
            or([equals(t1.cols.name, 'Paolo'), moreThan(t1.cols._id, 20)])
          ])
        )
        .orderBy([
          {field: t1.cols._id},
          {field: rawSql('"sameNameId"', true), isDesc: true}
        ]);
    }).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Multiple conditions with limit', () => {
    const expectedSql = `select
  t1.tst_id as "_id",
  (
    select min(tst.tst_id) as "minId"
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
          t1.cols._id,
          alias(
            selectFrom(tstTbl, (qry, t2) => {
              qry
                .fields(alias(min(t2.cols._id), 'minId'))
                .where(
                  and([
                    moreThan(t2.cols._id, t1.cols._id),
                    equals(t1.cols.name, t2.cols.name)
                  ])
                );
            }),
            'sameNameId'
          )
        ])
        .where(
          and([
            equals(t1.cols._id, prm('_id')),
            or([equals(t1.cols.name, 'Paolo'), moreThan(t1.cols._id, 20)])
          ])
        )
        .orderBy([
          {field: t1.cols._id},
          {field: rawSql('"sameNameId"', true), isDesc: true}
        ])
        .maxRows(10);
    }).toString();
    expect(sql).toBe(expectedSql);
  });

  test('Generic binary operator and concat', () => {
    const sql = tbl(tstTbl)
      .selectQry(tst => ({
        fields: [alias(concat('test_', tst.cols._id), 'testId')],
        where: equals(tst.cols.name, binaryOperator('what', '+=+', 'op'))
      }))
      .toSql();
    expect(sql).toBe(`select 'test_' || tst.tst_id as "testId"
from tst
where tst.tst_name = 'what' +=+ 'op'`);
  });
});
