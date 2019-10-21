import { IFieldReferenceFn } from "./sqlFieldReference";
import indentString from "indent-string";

let _prm: (name: string) => string = name => name;
export function prm(name: string) {
  return _prm(name);
}

export function setPrmFunction (prmFn: (name: string) => string) {
  _prm = prmFn;
}

export interface IBaseWhereCond {
  toSql: () => string;
}

export interface IWhereNullCond extends IBaseWhereCond {
  field: IFieldReferenceFn;
  type: NullComparatorType;
}

export interface INamedParameter extends IBaseWhereCond {
  parameterName: string;
}

export type WhereCondBinaryValue =
  | string
  | number
  | Date
  | IFieldReferenceFn
  | INamedParameter;

export interface IWhereFieldCond extends IBaseWhereCond {
  operator: BinaryValueComparator;
  field: IFieldReferenceFn;
  value: WhereCondBinaryValue;
}

export enum LogicalOperator {
  AND = "and",
  OR = "or",
  NOT = "not"
}

export interface IWhereLogicalCond extends IBaseWhereCond {
  operator: LogicalOperator;
  operands: IWhere | IWhere[];
}

export type IWhere = IWhereLogicalCond | IWhereFieldCond | IWhereNullCond;

export class NamedParameter implements INamedParameter {
  public parameterName: string;

  constructor(parameterName: string) {
    this.parameterName = parameterName;
  }

  public toSql = (): string => `$[${this.parameterName}]`;
}

enum BinaryValueComparator {
  equals = "=",
  lessThan = "<",
  lessThanOrEqual = "<=",
  moreThan = ">",
  moreThanOrEqual = ">=",
  diffs = "<>"
}

enum NullComparatorType {
  isNull = "isNull",
  isNotNull = "isNotNull"
}

class IsNullWhereCond implements IWhereNullCond {
  public field: IFieldReferenceFn;
  public type: NullComparatorType;

  constructor(field: IFieldReferenceFn, type = NullComparatorType.isNull) {
    this.field = field;
    this.type = type;
  }

  public toSql = () => {
    return `${this.field().toReferenceSql()} ${
      this.type === NullComparatorType.isNull ? "is null" : "is not null"
    }`;
  };
}

class BinaryOperatorCond implements IWhereFieldCond {
  public field: IFieldReferenceFn;
  public operator: BinaryValueComparator;
  public value: WhereCondBinaryValue;

  constructor(
    field: IFieldReferenceFn,
    operator: BinaryValueComparator,
    value: WhereCondBinaryValue
  ) {
    this.field = field;
    this.operator = operator;
    this.value = value;
  }

  public toSql = (): string => {
    const field = this.field();
    const fldRef = field.toReferenceSql();
    const strVal = field.valueToSql(this.value);
    return `${fldRef} ${this.operator} ${strVal}`;
  };
}

class LogicalOperatorCond implements IWhereLogicalCond {
  public operator: LogicalOperator;
  public operands: IWhere[];

  constructor(operator: LogicalOperator, operands: IWhere | IWhere[]) {
    this.operator = operator;
    this.operands = Array.isArray(operands) ? operands : [operands];
    if (this.operands.length < 1) {
      throw new Error("Creating a logical operator without conditions");
    }
  }

  public toSql = (nSpaces = 0) => {
    if (this.operator === LogicalOperator.NOT) {
      return `not (\n${indentString(this.operands[0].toSql(), 2)}\n)`;
    }
    return this.operands.map(operand => `(\n${indentString(operand.toSql(), 2)}\n)`).join(` ${this.operator}\n`);
  };
}

export class Where implements IBaseWhereCond {
  protected rootCond?: IWhere;

  constructor(field: IFieldReferenceFn, type?: NullComparatorType);
  constructor(
    field: IFieldReferenceFn,
    operator: BinaryValueComparator,
    value: WhereCondBinaryValue
  );
  constructor(operator: LogicalOperator, conditions: IWhere[]);
  constructor(
    fieldOrOperator: IFieldReferenceFn | LogicalOperator,
    typeOrOperatorOrConds?:
      | NullComparatorType
      | IWhere[]
      | BinaryValueComparator,
    value?: WhereCondBinaryValue
  ) {
    if (typeof fieldOrOperator === "function") {
      if (value) {
        this.rootCond = new BinaryOperatorCond(
          fieldOrOperator,
          typeOrOperatorOrConds as BinaryValueComparator,
          value
        );
      } else {
        this.rootCond = new IsNullWhereCond(
          fieldOrOperator,
          typeOrOperatorOrConds as NullComparatorType | undefined
        );
      }
    } else {
      this.rootCond = new LogicalOperatorCond(fieldOrOperator as LogicalOperator, typeOrOperatorOrConds as IWhere | IWhere[]);
    }
  }

  public toSql = (nSpaces = 0) => {
    if (this.rootCond) {
      return indentString(this.rootCond.toSql(), nSpaces);
    }
    return indentString("1 = 1", nSpaces);
  };
}

export function equals(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.equals, value);
}

export function moreThan(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.moreThan, value);
}

export function moreOrEqual(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.moreThanOrEqual, value);
}

export function lessThan(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.lessThan, value);
}

export function lessOrEqual(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.lessThanOrEqual, value);
}

export function diffs(field: IFieldReferenceFn, value: WhereCondBinaryValue): IWhere {
  return new BinaryOperatorCond(field, BinaryValueComparator.diffs, value);
}

export function and(operands: IWhere[]) {
  return new LogicalOperatorCond(LogicalOperator.AND, operands);
}

export function or(operands: IWhere[]) {
  return new LogicalOperatorCond(LogicalOperator.OR, operands);
}

export function not(operand: IWhere) {
  return new LogicalOperatorCond(LogicalOperator.NOT, operand);
}

export function isNull(field: IFieldReferenceFn) {
  return new IsNullWhereCond(field, NullComparatorType.isNull);
}

export function isNotNull(field: IFieldReferenceFn) {
  return new IsNullWhereCond(field, NullComparatorType.isNotNull);
}
