import {
  FieldReference,
  setFieldReferenceClass
} from './query/sqlTableFieldReference';
import {setPrmFunction} from './query/SQLExpression';

export class PGFieldReference<T> extends FieldReference<T> {
  protected encryptField = (fldText: string): string =>
    `encode(pgp_sym_encrypt(${fldText}, $[encryptionKey]), 'hex')`;

  protected decryptField = (fldText: string): string =>
    `case when ${fldText} is not null then pgp_sym_decrypt(decode(${fldText}, 'hex'), $[encryptionKey]) else null end`;

  protected hashField = (fldText: string): string =>
    `encode(digest(${fldText}, 'sha256'), 'hex')`;
  protected hashPwField = (fldText: string): string =>
    `crypt(${fldText}, gen_salt('md5'))`;
  protected hashPwFieldVal = (fldText: string): string =>
    `crypt(${fldText}, ${this.toReferenceSql()})`;
}

export const usePg = () => {
  setPrmFunction((prmName: string): string => `$[${prmName}]`);
  setFieldReferenceClass(PGFieldReference);
};
