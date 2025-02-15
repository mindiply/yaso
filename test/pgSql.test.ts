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
  binaryOperator,
  Id,
  tblCCFields,
  diffs,
  functionCall,
  caseWhen,
  not
} from '../src';

interface ITst {
  _id: string;
  name: string;
  encrypted: string;
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
      name: 'encrypted',
      dbName: 'tst_encrypted',
      isEncrypted: true
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
            .fields(count(tbl2Ref.cols._id))
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
  case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted",
  tst.tst_name as "name"
from tst`;
    expect(sql).toBe(expectedSql);
  });

  test('should be a select distinct *', () => {
    const sql = selectFrom(tstTbl).selectDistinct(true).toString();
    const expectedSql = `select distinct
  tst.tst_id as "_id",
  tst.tst_cc as "cc",
  case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted",
  tst.tst_name as "name"
from tst`;
    expect(sql).toBe(expectedSql);
  });

  test('Should order encrypted field by the encrypted function - in selected fields', () => {
    const sql = selectFrom(tstTbl, itst => {
      itst.orderBy([{field: itst.cols.encrypted}]);
    }).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_cc as "cc",
  case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted",
  tst.tst_name as "name"
from tst
order by "encrypted"`;
    expect(sql).toBe(expectedSql);
  });

  test('Should order encrypted field by the encrypted function - not in selected fields', () => {
    const sql = selectFrom(tstTbl, (qry, itst) => {
      qry
        .fields([itst.cols._id, itst.cols.name])
        .orderBy([{field: itst.cols.encrypted}]);
    }).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst.tst_name as "name"
from tst
order by case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end`;
    expect(sql).toBe(expectedSql);
  });

  test('custom aggregate operator', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry.fields(alias(aggregateWith('array_agg', tst.cols._id), 'ids'));
    }).toString();
    const expectedSql = `select array_agg(tst.tst_id) as "ids" from tst`;
    expect(sql).toBe(expectedSql);
  });

  test('custom distinct aggregate operator', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry
        .fields(alias(aggregateWith('array_agg', tst.cols._id), 'ids'))
        .selectDistinct(true);
    }).toString();
    const expectedSql = `select distinct array_agg(tst.tst_id) as "ids" from tst`;
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
  case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted",
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
    select count(tst2.tst_id) as "SQC1"
    from tst as "tst2"
    where tst2.tst_name = tst.tst_name
  ) as "complexCF"
from tst
where tst.tst_name = $[name]`);
  });

  test('should select distinct  id and complex calculated field', () => {
    const sql = selectFrom(tstTbl, (qry, tst) => {
      qry
        .fields([tst.cols._id, tst.cols.complexCF])
        .selectDistinct(true)
        .where(equals(tst.cols.name, prm('name')));
    }).toSql();
    expect(sql).toBe(`select distinct
  tst.tst_id as "_id",
  (
    select count(tst2.tst_id) as "SQC1"
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
    select count(tst2.tst_id) as "SQC1"
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
  case when tst.tst_encrypted is not null then pgp_sym_decrypt(decode(tst.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted",
  case when tst2.tst_encrypted is not null then pgp_sym_decrypt(decode(tst2.tst_encrypted, 'hex'), $[encryptionKey]) else null end as "encrypted2",
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
    const expectedSql = `select array_agg("SQ"."_id") as "ids"
from (select tst.tst_id as "_id" from tst order by tst.tst_name) as "SQ"`;
    expect(sql).toBe(expectedSql);
  });

  test('Allow selecting first n rows of a table select in a specific order', () => {
    const expectedSql = `select
  "SQ"."_id",
  "SQ"."cc",
  "SQ"."name"
from
  (
    select
      tst.tst_id as "_id",
      tst.tst_cc as "cc",
      tst.tst_name as "name"
    from tst
    order by "name" desc
  ) as "SQ"
limit 10`;
    const sql = selectFrom(
      selectFrom(tbl(tstTbl), (qry, iTst) => {
        qry.fields([iTst.cols._id, iTst.cols.cc, iTst.cols.name]);
        qry.orderBy([{isDesc: true, field: iTst.cols.name}]);
      }),
      oQry => {
        oQry.maxRows(10);
      }
    ).toSql();
    expect(sql).toBe(expectedSql);
  });

  test('should work with cross product', () => {
    const sql = selectFrom([tblDef, tblDef], (qry, tst1, tst2) =>
      qry.fields([tst1.cols._id, tst2.cols.name])
    ).toString();
    const expectedSql = `select
  tst.tst_id as "_id",
  tst2.tst_name as "name"
from tst, tst as "tst2"`;
    expect(sql).toBe(expectedSql);
  });

  test('simple where by id clause', () => {
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
order by "_id" desc`;
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

  test('Multiple conditions and non-selected order field', () => {
    const expectedSql = `select t1.tst_id as "_id"
from tst as "t1"
where
  t1.tst_id = $[_id]
  and (
    t1.tst_name = 'Paolo'
    or t1.tst_id > 20
  )
order by t1.tst_name desc`;
    const sql = selectFrom(tbl(tstTbl, 't1'), (qry, t1) => {
      qry
        .fields(t1.cols._id)
        .where(
          and([
            equals(t1.cols._id, prm('_id')),
            or([equals(t1.cols.name, 'Paolo'), moreThan(t1.cols._id, 20)])
          ])
        )
        .orderBy([{field: t1.cols.name, isDesc: true}]);
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
  "_id",
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
  "_id",
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

describe('Working with subQueries', () => {
  test('Querying a subtable', () => {
    const sql = selectFrom(
      selectFrom<ITst, {cid: string}>(tstTbl, (qry, tst) => {
        qry
          .fields(
            alias(functionCall('concat', tst.cols._id, tst.cols.name), 'cid')
          )
          .where(diffs(tst.cols._id, value(23)));
      }),
      outerQry => {
        outerQry
          .fields([
            outerQry.cols.cid,
            alias(functionCall('echo', outerQry.cols.cid), 'f1')
          ])
          .where(equals(outerQry.cols.cid, value('testid')));
      }
    );
    expect(sql.toSql()).toBe(`select
  echo("SQ"."cid") as "f1",
  "SQ"."cid"
from
  (
    select concat(tst.tst_id, tst.tst_name) as "cid"
    from tst
    where tst.tst_id <> 23
  ) as "SQ"
where "SQ"."cid" = 'testid'`);
  });

  test('Querying a subtable with binary operator in where', () => {
    const sql = selectFrom(
      selectFrom<ITst, {cid: string}>(tstTbl, (qry, tst) => {
        qry
          .fields(
            alias(functionCall('concat', tst.cols._id, tst.cols.name), 'cid')
          )
          .where(diffs(tst.cols._id, value(23)));
      }),
      outerQry => {
        outerQry
          .fields([
            outerQry.cols.cid,
            alias(functionCall('echo', outerQry.cols.cid), 'f1')
          ])
          .where(binaryOperator(outerQry.cols.cid, '@?', value('testid')));
      }
    );
    expect(sql.toSql()).toBe(`select
  echo("SQ"."cid") as "f1",
  "SQ"."cid"
from
  (
    select concat(tst.tst_id, tst.tst_name) as "cid"
    from tst
    where tst.tst_id <> 23
  ) as "SQ"
where "SQ"."cid" @? 'testid'`);
  });

  test('case statement with then tbl subquery', () => {
    const sql = tbl(tstTbl).selectQry(tst1 => ({
      fields: [
        alias(
          caseWhen(
            [
              {
                condition: equals(tst1.cols.cc, 10),
                then: tbl(tstTbl).selectQry(tst2 => ({
                  fields: [min(nullValue(tst2.cols.name, ''))],
                  where: not(equals(tst2.cols._id, tst1.cols._id))
                }))
              }
            ],
            value('')
          ),
          'F1'
        )
      ]
    }));
    const expectedSql = `select
  (
    case
      when tst2.tst_cc = 10 then (
        select min(coalesce(tst.tst_name, '')) as "SQC1"
        from tst
        where not (tst.tst_id = tst2.tst_id)
      )
      else ''
    end
  ) as "F1"
from tst as "tst2"`;
    expect(sql.toSql()).toBe(expectedSql);
  });

  test('case statement with then tbl selectFrom qry', () => {
    const sql = tbl(tstTbl).selectQry(tst1 => ({
      fields: [
        alias(
          caseWhen(
            [
              {
                condition: equals(tst1.cols.cc, 10),
                then: selectFrom(tstTbl, (qry, tst2) => {
                  qry.fields([min(nullValue(tst2.cols.name, ''))]);
                  qry.where(not(equals(tst2.cols._id, tst1.cols._id)));
                })
              }
            ],
            value('')
          ),
          'F1'
        )
      ]
    }));
    const expectedSql = `select
  (
    case
      when tst2.tst_cc = 10 then (
        select min(coalesce(tst.tst_name, '')) as "SQC1"
        from tst
        where not (tst.tst_id = tst2.tst_id)
      )
      else ''
    end
  ) as "F1"
from tst as "tst2"`;
    expect(sql.toSql()).toBe(expectedSql);
  });
});

interface PwDigestTbl {
  _id: Id;
  tstId: Id;
  name: string;
  pwDigest: string;
  email: string;
  emailDigest: string;
  createdAt: Date;
  updatedAt: Date;
  cc: number;
}

const pwDigestTblDef: TableDefinition<PwDigestTbl> = {
  name: 'PasswordDigestTable',
  dbName: 'pdt',
  fields: [
    {
      dbName: 'pdt_id',
      name: '_id'
    },
    {
      dbName: 'pdt_tst_id',
      name: 'tstId'
    },
    {
      dbName: 'pdt_name',
      name: 'name'
    },
    {
      dbName: 'pdt_pw_digest',
      name: 'pwDigest',
      isPwHash: true
    },
    {
      dbName: 'pdt_email',
      name: 'email',
      isEncrypted: true
    },
    {
      dbName: 'pdt_email_digest',
      name: 'emailDigest',
      isHash: true
    },
    ...tblCCFields('pdt')
  ]
};

describe('digest and password fields', () => {
  test('Check password and email returning email', () => {
    const sql = selectFrom([tblDef, pwDigestTblDef], (qry, tst, pdt) => {
      qry
        .fields([pdt.cols._id, pdt.cols.name, pdt.cols.email, tst.cols.name])
        .where(
          and([
            equals(pdt.cols.tstId, tst.cols._id),
            equals(
              pdt.cols.emailDigest,
              pdt.cols.emailDigest().readValueToSql(prm('email'))
            ),
            equals(
              pdt.cols.pwDigest,
              pdt.cols.pwDigest().readValueToSql(prm('pw'))
            )
          ])
        );
    }).toSql();
    expect(sql).toBe(`select
  pdt.pdt_id as "_id",
  case when pdt.pdt_email is not null then pgp_sym_decrypt(decode(pdt.pdt_email, 'hex'), $[encryptionKey]) else null end as "email",
  pdt.pdt_name as "name",
  tst.tst_name as "name2"
from tst, pdt
where
  pdt.pdt_tst_id = tst.tst_id
  and pdt.pdt_email_digest = encode(digest($[email], 'sha256'), 'hex')
  and pdt.pdt_pw_digest = crypt($[pw], pdt.pdt_pw_digest)`);
  });
});
