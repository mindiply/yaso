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
