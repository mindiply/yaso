# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added

- ~~Add calculated fields (subqueries) to table definitions~~
- Complete coverage of SQL expressions
  - ~~In and not in statements in particular~~
  - ~~exists and not exists~~
  - group by clause
  - union of select statements
- Ability to work with sql statements as sql expressions in join, from and wheres
- Refactor SQL dialect specific code to be in unique place and
easy to adapt for other dialects
- Overload insert and update queries so that the dictionary of
changes returns both the sql and an array or dictionary of values
to be passed onto the preferred db connection library

## [0.0.27] - 2023-09-12

### Added
- You can now make a select distinct, using isSelectDistinct tableQueryParameter
  or by using selectDistinct() on a SelectQuery.

      const sql = tableSelectSql(qryTbl, {
        isSelectDistinct: true,
        fields: ['id']
      });

      const sql = selectFrom(tstTbl, (qry, tst) => {
          qry
            .fields([tst.cols._id, tst.cols.complexCF])
            .selectDistinct(true)
            .where(equals(tst.cols.name, prm('name')));
      }).toSql();

## [0.0.26] 2022-03-31

### Added
- Added *changesNamedParameters* function that is useful when you have
  an object with update or insert field/value pairs and want to get
  an object with the same field names and as values named parameters
  sql expressions with the same name as the field name.
  
## [0.0.25] 2021-04-07

### Added
- Added sql expression **functionCall** representing a function
call.

      functionCall('longTestFunctionNameToCauseWrap', [
          1,
          'test',
          'longFunctionParamNameToCauseWrap',
          'longFunctionParamNameToCauseWrap2',
          'longFunctionParamNameToCauseWrap3'
      ]).toSql()  
    
    that produces:

      longTestFunctionNameToCauseWrap(
          1,
          'test',
          'longFunctionParamNameToCauseWrap',
          'longFunctionParamNameToCauseWrap2',
          'longFunctionParamNameToCauseWrap3'
      )

### Changes
- list() now accepts either an array or a list of
parameters.
  
### Fixes
- list() did not wrap correctly, omitting the comma between elements 

## [0.0.24] 2021-03-03

### Issues
- Unable to write a query using a sub-table like:


    select
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
        order by tst.tst_name desc
    ) as "SQ"
    limit 10

## [0.0.23] - 2020-09-14
### Fixes
- When using date constants use string literals rather than
unquoted strings

## [0.0.22] - 2020-09-04
### Fixes
- Fix in referincing column of subquery table,
    select "SQ"."ALIAS" instead of erroneous select "SQ.ALIAS"

## [0.0.21] - 2020-09-03
### Fixes
- Typescript types fixes from 0.0.20

## [0.0.20] - 2020-09-03
### Breaking changes
- The columns of resultsets and queries are now accessed via
the cols member, rather than directly for the queryTable object.
This avoids any potential conflicts with the other functions
exported by the query objects and simplifies typings

### Added
- It's now possible adding a select query in the
from clause of a select query, e.g.

    select SQ._id from (
        select tst.tst_id as "_id"
        from tst
        order by tst_name
    ) as SQ 
ß
## [0.0.19] - 2020-07-30

### Fixes
- Changed handling of unmapped fields in update and insert queries.
  We now throw a TypeError with the name of the first offending field
  in the exception

## [0.0.18] - 2020-07-30

### Fixes
- Fixed thrown exception when creating an insert query with a
  field that is not mapped. The field is now ignored. 

## [0.0.17] - 2020-07-17

### Fixes
- Using NULL as value in insert statements raised an
exception

## [0.0.16] - 2020-07-09

### Fixes
- Fixed incorrect implementation of CASE WHEN ... ELSE END

## [0.0.15] - 2020-07-08

### Added
- **exists (*subQuery*)** expressions are now supported
- **castAs(expression, type)** allows casting values and expressions with 
    **CAST (*expr* as type)** expressions

## [0.0.14] - 2020-07-06

### Added
- Added **deleteQuerySql** function to create delete statements,
  as well as with the methods **deleteQuery** and **deleteQuerySql&& of
  referenced table objects

## [0.0.13] - 2020-07-06

### Added
- **concat** binary operator for string concatenation
- **binaryOperator** allows injecting binary operators not offered by the implementation

## [0.0.12] - 2020-06-18

### Fixes
- FieldReferenceFn is now a SQLExpression itself
- sqlIn and sqlNotIn accept only a list expression or a select expression
- Linting fixes after packages update

## [0.0.11] - 2020-05-05

### Fixes
- Types for join not working with field references anymore
- build error in 0.0.10

## [0.0.10] - 2020-05-04

### Added
- In the list of fields for select statements you can now
add a referenced table object, and all the table fields
for the table will be added. Useful if you need all the fields
from a table plus one or more calculated fields.

## [0.0.9] - 2020-05-04

### Added
- It's now possible to define calculated fields to the table
definition, and referencing them in the select or where
clauses of statements.
- It's now possible to use the *aggregateWith* function to add
aggregation operators not supplied by default, or specific
to a datbase platform

## [0.0.8] - 2020-03-14

### Fixes
- Coalesce with subqueries did not wrap the subquery in
parenthesis causing a syntax error

## [0.0.7] - 2020-01-17

### Added
- Added the following SQL expressions/clauses:
  - **orderBy** clause to select queries
  - **value**
  - **caseWhen** case when else expression
  - **nullValue** for specifying an alternative value when the first expression is null
  - **sqlNull** for insertint the NULL reserved word

## [0.0.6] - 2020-01-07

### Added
- A select query has now a maxRows method that sets a limit
on the number of rows returned. Works for Postgres only at the moment.

### Changed
- The select query created from a table reference object is a ISelectQry,
meaning it can be manipulated the same way as starting with selectFrom.

## [0.0.5] - 2019-12-16

### Fixes
- Generation of encrypted and hash fields in where clauses were within
brackets
- Removed encode function with pgcrypt for password hashes
- Changed the type definitions for join to instantiate correctly
when used


## [0.0.4] - 2019-10-31

### Added
- Added in and not in expressions
- Refactored table reference and table query so they have
separate responsibilities and the queries created from
tablequery are also sql expressions
- Basic support for subqueries, still need automated
alias generation 

### Fixes
- Added boolean as accepted SQL value
- Update and insert timestamps now tested and added correctly

## [0.0.3] - 2019-10-23

### Added
- Added option to return fields from insert and update queries.
- Added alias, min, max, sum, count SQL expressions

### Changes
- Insert and update queries now use a parameters object rather
than positional parameters

### Fixes
- **tableSelectSql** exported from my index file

## [0.0.2] - 2019-10-23

### Added
- Added **tableSelectSql** to select records from one specific table.

### Fixes
- Added typescript typings in the lib folder

## [0.0.1] - 2019-10-23

### Added
- Limited capabilities initial launch. Able to create basic 
multi-table queries and simple update and insert queries.
