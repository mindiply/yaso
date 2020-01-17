# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added

- Add calculated fields (subqueries) to table definitions
- Complete coverage of SQL expressions
  - ~~In and not in statements in particular~~
  - ~~exists and not exists~~
  - union of select statements
- Ability to work with sql statements as sql expressions in join, from and wheres
- Refactor SQL dialect specific code to be in unique place and
easy to adapt for other dialects
- Overload insert and update queries so that the dictionary of
changes returns both the sql and an array or dictionary of values
to be passed onto the preferred db connection library


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
