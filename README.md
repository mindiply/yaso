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
                    equals(tst._id, prm('tstId'))
                )
    ).toString();
    
which produces

    select
      tst.tst_id as "_id",
      tst.tst_cc as "cc"
    from tst
    where
      tst.tst_id = $[tstId]


## Select from


## ToDo
- Subqueries in select and update
- Ability to create table aliases for multiple tables, conflict only
it the user defines two aliases that are the same
- Automated addition of update fields when updating and inserting
fields in the table, checking they are not added already by
the user
