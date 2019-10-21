import { FieldReference } from "./query/sqlFieldReference";
import {setPrmFunction} from './query/sqlWhere'
import {setFieldReferenceClass} from './query/sqlQuery'

export const usePg = () => {
  setPrmFunction((prmName: string): string => `$[${prmName}]`);
  setFieldReferenceClass(PGFieldReference);
}

export class PGFieldReference<T> extends FieldReference<T> {
  protected encryptField = (fldText: string): string =>
    `encode(pgp_sym_encrypt(${fldText}, $[encryptionKey]), 'hex')`;

  protected decryptField = (fldText: string): string =>
    `pgp_sym_decrypt(decode(${fldText}, 'hex'), $[decryptionKey])`;
}
