/**
 * The IStatement family of interfaces is meant to provide a low level API
 * to the rest of the library to build SQL statements.
 *
 * The statement family of interfaces is meant to be passed and manipulated by
 * DBDialect objects, so that syntax unique to each db (and library) provider
 * can be injected in the blocks that make up a SQL statement.
 *
 * The IStatement family of interfaces is created and managed by higher level
 * functions and classes like TableQuery and SelectQry.
 */

import {MAX_SINGLE_LINE_STATEMENT_LENGTH} from './types';
import {IQueryContext, SQLExpression} from '../dbTypes';
import {QueryContext} from './queryContext';

/**
 * Interface to manage blocks that make up a Sql statement (select block,
 * from block, where block....).
 *
 * The blocks are named, so that we can replace existing blocks if needed,
 * but most operations access them by index and we use indexOfStatementBlock to
 * get the index of a block name.
 */
interface IClauses {
  nStatementClauses: () => number;
  addClause: (name: string, block: SQLExpression, index?: number) => void;
  replaceClause: (index: number, block: SQLExpression) => void;
  moveClause: (fromIndex: number, toIndex: number) => void;
  getClauseByIndex: (index: number) => SQLExpression;
  deleteClauseByIndex: (index: number) => void;
  indexOfClause: (blockName: string) => number;
}

/**
 * A SQL statement is built up of statement clauses, and its toSql function
 * creates the string representation of the statement stored in the IStatement
 * object.
 *
 * The SQL statement interface is meant to be used by higher level function and classes,
 * not directly by users of the library.
 */
export interface IStatement extends SQLExpression, IClauses {}

export class Statement implements IStatement {
  protected blocks: string[];
  protected blocksMap: Map<string, SQLExpression>;

  constructor() {
    this.blocks = [];
    this.blocksMap = new Map();
  }

  public nStatementClauses = () => this.blocks.length;

  public addClause = (name: string, block: SQLExpression, index?: number) => {
    const existingIndex = this.blocks.indexOf(name);
    const insertIndex =
      index && index > 0 && index < this.blocks.length
        ? index
        : this.blocks.length;
    if (existingIndex === -1) {
      this.blocks.splice(insertIndex, 0, name);
    } else {
      // The block with this name already exists.
      // we will only replace the sql expression without changing
      // the order
    }
    this.blocksMap.set(name, block);
  };

  public replaceClause = (index: number, block: SQLExpression): void => {
    if (index < 0 || index >= this.blocks.length) {
      return;
    }
    this.blocksMap.set(this.blocks[index], block);
  };

  public moveClause = (fromIndex: number, toIndex: number): void => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.blocks.length ||
      toIndex >= this.blocks.length
    ) {
      return;
    }
    const [blockName] = this.blocks.splice(fromIndex, 1);
    this.blocks.splice(toIndex, 0, blockName);
  };

  public getClauseByIndex = (index: number): SQLExpression => {
    if (index < 0 || index >= this.blocks.length) {
      throw new Error('Block does not exist');
    }
    return this.blocksMap.get(this.blocks[index])!;
  };

  public deleteClauseByIndex = (index: number): void => {
    if (index < 0 || index >= this.blocks.length) {
      return;
    }
    this.blocksMap.delete(this.blocks[index]);
    this.blocks.splice(index, 1);
  };

  public indexOfClause = (blockName: string): number => {
    return this.blocks.indexOf(blockName);
  };

  public isSimpleValue = () => false;

  public toSql = (context?: IQueryContext) => {
    const qryContext = context ? context : new QueryContext();
    let nChars = 0;
    const statementLines = this.blocks.map((blockName, index) => {
      const blockSql = this.blocksMap.get(blockName)!.toSql(qryContext);
      nChars += blockSql.length + (index > 0 ? 1 : 0);
      return blockSql;
    });
    return statementLines.join(
      nChars <= MAX_SINGLE_LINE_STATEMENT_LENGTH &&
        statementLines.every(line => !/\r|\n/.test(line))
        ? ' '
        : '\n'
    );
  };
}

/**
 * A Select statement provides properties that are unique to Select statements.
 */
export interface ISelectStatement extends IStatement {
  maxReturnRows?: number;
}

class SelectStatement extends Statement implements ISelectStatement {
  public maxReturnRows?: number;

  constructor(maxRows?: number) {
    super();
    this.maxReturnRows = maxRows;
  }
}

export const createSelectStatement = (maxRows?: number): ISelectStatement =>
  new SelectStatement(maxRows);
