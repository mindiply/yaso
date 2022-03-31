import {
  add,
  count,
  equals,
  TableDefinition,
  selectFrom,
  tbl,
  alias,
  moreThan,
  list,
  functionCall,
  prm,
  changesNamedParameters
} from '../src';

interface ITst {
  _id: string;
  name: string;
  cc: number;
  createdAt: Date;
  simpleCF: () => number;
  complexCF: () => number;
  calculation: () => number;
}

interface ITstDescr extends ITst {
  description: string;
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
    },
    {
      name: 'createdAt',
      dbName: 'tst_created_at',
      isInsertTimestamp: true
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

// @ts-expect-error unable to inherit extended interface
const tblDecrDef: TableDefinition<ITstDescr> = {
  ...tblDef,
  fields: [
    ...tblDef.fields,
    {
      name: 'description',
      dbName: 'tst_descr'
    }
  ]
};

const tst = tbl(tblDef);

describe('list()', () => {
  test('Short simple values', () => {
    expect(list([1, 2, 3, 4]).toSql()).toBe('(1, 2, 3, 4)');
    expect(list(1, 2, 3, 4).toSql()).toBe('(1, 2, 3, 4)');
  });

  test('Long simple values', () => {
    expect(
      list(
        tst.cols._id().toReferenceSql(),
        tst.cols.cc().toReferenceSql(),
        tst.cols.name().toReferenceSql(),
        tst.cols.createdAt().toReferenceSql(),
        'Additional text to pad to go past 72 characters you know we need it yeah?'
      ).toSql()
    ).toBe(`(
  tst.tst_id,
  tst.tst_cc,
  tst.tst_name,
  tst.tst_created_at,
  'Additional text to pad to go past 72 characters you know we need it yeah?'
)`);
  });
});

describe('null values', () => {
  const updateQrySql = tbl(tst).updateQrySql(tst => ({
    fields: {
      name: null
    },
    where: equals(tst.cols._id, prm('tstId'))
  }));
  expect(updateQrySql).toBe(
    `update tst
set
  tst_cc = tst_cc + 1,
  tst_name = NULL
where tst.tst_id = :tstId`
  );
});

describe('functionCall', () => {
  test('Short no params call', () => {
    expect(functionCall('tstFn').toSql()).toBe('tstFn()');
  });

  test('Short 1 param call', () => {
    expect(functionCall('tstFn', 1).toSql()).toBe('tstFn(1)');
  });

  test('Short 2 params call', () => {
    expect(functionCall('tstFn', 1, 'test').toSql()).toBe(`tstFn(1, 'test')`);
  });

  test('Long 3 params call', () => {
    expect(
      functionCall('longTestFunctionNameToCauseWrap', [
        1,
        'test',
        'longFunctionParamNameToCauseWrap',
        'longFunctionParamNameToCauseWrap2',
        'longFunctionParamNameToCauseWrap3'
      ]).toSql()
    ).toBe(`longTestFunctionNameToCauseWrap(
  1,
  'test',
  'longFunctionParamNameToCauseWrap',
  'longFunctionParamNameToCauseWrap2',
  'longFunctionParamNameToCauseWrap3'
)`);
  });
});

describe('SQL Expressions regressions', () => {
  test('Null value on insert', () => {
    const sql = tst.insertQrySql({fields: {name: null, cc: 0}});
    expect(sql).toBe(
      `insert into tst (
  tst_cc,
  tst_created_at,
  tst_name
) values (
  0,
  now,
  NULL
)`
    );
  });

  test('Date values as strings', () => {
    expect(moreThan(tst.cols.createdAt, new Date(2020, 0, 1)).toSql()).toBe(
      `tst.tst_created_at > '2020-01-01T00:00:00.000Z'`
    );
  });
});

describe('SQL insert and update named paramters', () => {
  test('Insert', () => {
    const changes: Partial<ITstDescr> = {
      name: 'newname',
      description: 'newDescr'
    };
    const sql = tbl(tblDecrDef).insertQrySql(tst => ({
      fields: changesNamedParameters(changes),
      where: equals(tst.cols._id, prm('_id'))
    }));
    expect(sql).toBe(
      `insert into tst (
  tst_cc,
  tst_created_at,
  tst_descr,
  tst_name
) values (
  0,
  now,
  :description,
  :name
)`
    );
  });
});
