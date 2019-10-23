import {IFieldReferenceFn} from './sqlFieldReference';
import indentString from 'indent-string';

export enum JoinType {
  inner = 'inner',
  leftOuter = 'leftOuter',
  rightOuter = 'rightOuter'
}

const sqlJoinByType = (joinType: JoinType): string => {
  if (joinType === JoinType.inner) {
    return 'join';
  }
  if (joinType === JoinType.leftOuter) {
    return 'left outer join';
  }
  if (joinType === JoinType.rightOuter) {
    return 'right outer join';
  }
  throw new Error(`Unexpected join type: ${joinType}`);
};

export interface IJoin<T1 = any, T2 = any, T3 = any, T4 = any> {
  type: JoinType;
  from: IFieldReferenceFn | IJoin<T1, T2>;
  to: IFieldReferenceFn | IJoin<T2, T3> | IJoin<T3, T4>;
  onFrom?: IFieldReferenceFn;
  onTo?: IFieldReferenceFn;
  toSql: (nSpaces?: number) => string;
}

export class Join implements IJoin {
  public type: JoinType;
  public from: IFieldReferenceFn | IJoin;
  public to: IFieldReferenceFn | IJoin;
  public onFrom?: IFieldReferenceFn;
  public onTo?: IFieldReferenceFn;

  constructor(
    p1: IFieldReferenceFn | IJoin,
    p2: IFieldReferenceFn | IJoin,
    p3: JoinType | IFieldReferenceFn | IJoin = JoinType.inner,
    p4?: JoinType | IFieldReferenceFn,
    p5?: JoinType
  ) {
    if (typeof p1 === 'function') {
      this.from = p1;
      if (typeof p2 === 'function') {
        this.to = p2;
        this.type = (p3 as JoinType) || JoinType.inner;
      } else {
        this.to = p2;
        this.onTo = p3 as IFieldReferenceFn;
        this.type = (p4 as JoinType) || JoinType.inner;
      }
    } else {
      this.from = p1;
      this.onFrom = p2 as IFieldReferenceFn;
      if (typeof p3 === 'function') {
        this.to = p3 as IFieldReferenceFn;
        this.type = (p4 as JoinType) || JoinType.inner;
      } else {
        this.to = p3 as IJoin;
        this.onTo = p4 as IFieldReferenceFn;
        this.type = (p5 as JoinType) || JoinType.inner;
      }
    }
  }

  public toSql = (nSpaces = 0): string => {
    if (typeof this.from === 'function') {
      if (typeof this.to === 'function') {
        const fromRef = (this.from as IFieldReferenceFn)();
        const from = fromRef.qryTbl.toSql();
        const fromFld = fromRef.toReferenceSql();
        const toRef = (this.to as IFieldReferenceFn)();
        const to = toRef.qryTbl.toSql();
        const toFld = toRef.toReferenceSql();
        return ` ${from} ${sqlJoinByType(
          this.type
        )} ${to} on ${fromFld} = ${toFld}`;
      } else {
        const fromRef = (this.from as IFieldReferenceFn)();
        const from = fromRef.qryTbl.toSql();
        const fromFld = fromRef.toReferenceSql();
        const toRef = (this.onTo as IFieldReferenceFn)();
        const toJoin = (this.to as IJoin).toSql(nSpaces + 4);
        const toFld = toRef.toReferenceSql();
        return indentString(
          `
${from} ${sqlJoinByType(this.type)} (
  ${toJoin}
) on ${fromFld} = ${toFld}`,
          nSpaces + 2
        );
      }
    } else {
      if (typeof this.to === 'function') {
        const fromJoin = (this.from as IJoin).toSql(nSpaces + 4);
        const fromRef = (this.onFrom as IFieldReferenceFn)();
        const fromFld = fromRef.toReferenceSql();
        const toRef = (this.to as IFieldReferenceFn)();
        const to = toRef.qryTbl.toSql();
        const toFld = toRef.toReferenceSql();
        return indentString(
          `
(
  ${fromJoin}
) ${sqlJoinByType(this.type)} ${to} on ${fromFld} = ${toFld}`,
          nSpaces + 2
        );
      } else {
        const fromJoin = (this.from as IJoin).toSql(nSpaces + 4);
        const fromRef = (this.onFrom as IFieldReferenceFn)();
        const fromFld = fromRef.toReferenceSql();
        const toJoin = (this.to as IJoin).toSql(nSpaces + 4);
        const toRef = (this.onTo as IFieldReferenceFn)();
        const toFld = toRef.toReferenceSql();
        return indentString(
          `
(
  ${fromJoin}
) ${sqlJoinByType(this.type)} (
  ${toJoin}
) on ${fromFld} = ${toFld}`,
          nSpaces + 2
        );
      }
    }
  };
}

export function join<T1, T2>(
  onFieldTbl1: IFieldReferenceFn,
  onFieldTbl2: IFieldReferenceFn,
  type: JoinType
): IJoin<T1, T2>;
export function join<T1, T2, T3>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: IFieldReferenceFn,
  onFieldTbl2: IFieldReferenceFn,
  type: JoinType
): IJoin<IJoin<T1, T2>, T3>;
export function join<T1, T2, T3>(
  onFieldTbl1: IFieldReferenceFn,
  existingJoinRight: IJoin<T2, T3>,
  onTo: IFieldReferenceFn,
  type: JoinType
): IJoin<T1, IJoin<T2, T3>>;
export function join<T1, T2, T3, T4>(
  existingJoinLeft: IJoin<T1, T2>,
  onFrom: IFieldReferenceFn,
  existingJoinRight: IJoin<T3, T4>,
  onTo: IFieldReferenceFn,
  type: JoinType
): IJoin<IJoin<T1, T2>, IJoin<T3, T4>>;
export function join(
  p1: IFieldReferenceFn | IJoin<any, any>,
  p2: IFieldReferenceFn | IJoin<any, any>,
  p3: JoinType | IFieldReferenceFn | IJoin<any, any> = JoinType.inner,
  p4?: JoinType | IFieldReferenceFn,
  p5?: JoinType
): IJoin {
  if (typeof p1 === 'function') {
    if (typeof p2 === 'function') {
      return new Join(p1, p2 as IFieldReferenceFn, p3 as JoinType);
    } else {
      return new Join(
        p1 as IFieldReferenceFn,
        p2 as IJoin,
        p3 as IFieldReferenceFn,
        p4 as JoinType
      );
    }
  } else {
    if (typeof p2 === 'function') {
      return new Join(
        p1,
        p2 as IFieldReferenceFn,
        p3 as IFieldReferenceFn,
        p4 as JoinType
      );
    } else {
      return new Join(
        p1 as IJoin,
        (p2 as any) as IFieldReferenceFn,
        p3 as IJoin,
        p4 as IFieldReferenceFn,
        p5 as JoinType
      );
    }
  }
}
