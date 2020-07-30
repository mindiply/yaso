import {add, count, equals, ITableDefinition, selectFrom, tbl} from '../src';

interface ITst {
  _id: string;
  name: string;
  cc: number;
  simpleCF: () => number;
  complexCF: () => number;
  calculation: () => number;
}

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
  ],
  calculatedFields: [
    {
      name: 'simpleCF',
      dbName: 'simpleCF',
      calculation: tblRef => add(tblRef.cc, tblRef.cc)
    },
    {
      name: 'complexCF',
      dbName: 'complexCF',
      calculation: tblRef =>
        selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
          qry
            .fields(count(tbl2Ref._id))
            .where(equals(tbl2Ref.name, tblRef.name));
        })
    },
    {
      name: 'calculation',
      dbName: 'exampleCalculation',
      calculation: tblRef =>
        selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
          qry
            .fields(count(tbl2Ref._id))
            .where(equals(tbl2Ref.name, tblRef.name));
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
