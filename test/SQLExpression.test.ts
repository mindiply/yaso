import {
  add,
  count,
  equals,
  TableDefinition,
  selectFrom,
  tbl,
  alias
} from '../src';

interface ITst {
  _id: string;
  name: string;
  cc: number;
  simpleCF: () => number;
  complexCF: () => number;
  calculation: () => number;
}

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
            .fields(alias(count(tbl2Ref.cols._id), 'idsCount'))
            .where(equals(tbl2Ref.cols.name, tblRef.cols.name));
        })
    },
    {
      name: 'calculation',
      dbName: 'exampleCalculation',
      calculation: tblRef =>
        selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
          qry
            .fields(alias(count(tbl2Ref.cols._id), 'idsCount'))
            .where(equals(tbl2Ref.cols.name, tblRef.cols.name));
        })
    }
  ]
};

const tst = tbl(tblDef);

describe('SQL Expressions regressions', () => {
  test('Null value on insert', () => {
    const sql = tst.insertQrySql({fields: {name: null, cc: 0}});
    expect(sql).toBe(
      `insert into tst (
  tst_cc,
  tst_name
) values (
  0,
  NULL
)`
    );
  });
});
