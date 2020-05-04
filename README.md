# yaso
Yet another sql orm, with some benefits like encryption of fields,
hashing of fields, automatic timestamp and version count fields.

At the moment aimed at Postgres.

You create table definitions

    const tblDef: ITableDefinition<ITst> = {
        name: "Test",
        dbName: "tst",
        fields: [
          {
            name: "_id",
            dbName: "tst_id"
          },
          {
            name: "name",
            dbName: "tst_name"
          },
          {
            name: "cc",
            dbName: "tst_cc",
            isCC: true
          }
        ], 
        calculatedFields: [
          {
            name: "calculation",
            dbName: "exampleCalculation",
            calculation: tblRef =>
                selectFrom(tbl(tblDef), (qry, tbl2Ref) => {
                  qry
                    .fields(count(tbl2Ref._id))
                    .where(equals(tbl2Ref.name, tblRef.name));
                })
          }
        ]
      };
      interface ITst {
        _id: string;
        name: string;
        cc: number;
      }
      const tstTbl = new DBTable<ITst>(tblDef);

and later on use them to create queries

    const sql = selectFrom(
        tstTbl,
        (qry, tst) =>
            qry.fields([tst._id, tst.cc])
                .where(
                    and([
                      equals(tst._id, prm('tstId')),
                      moreThan(tst.calculation, 1)  
                    ])
                )
    ).toString();
    
which produces

      select
        tst.tst_id as "_id",
        tst.tst_cc as "cc"
      from tst
      where
        tst.tst_id = $[tstId]
        and (
          select count(tst2.tst_id)
          from tst as "tst2"
          where tst2.tst_name = tst.tst_name
        ) > 1


## Select from


## ToDo
- Subqueries in select and update
- Ability to create table aliases for multiple tables, conflict only
it the user defines two aliases that are the same
- Automated addition of update fields when updating and inserting
fields in the table, checking they are not added already by
the user
