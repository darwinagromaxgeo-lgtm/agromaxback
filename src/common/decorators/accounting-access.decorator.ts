import { SetMetadata } from '@nestjs/common';

export const ACCOUNTING_READ_KEY = 'accountingRead';
export const ACCOUNTING_PASSWORD_KEY = 'accountingOwnPassword';

/** Exposes only GET/HEAD requests; writes remain blocked by AccountingAccessGuard. */
export const AccountingRead = () => SetMetadata(ACCOUNTING_READ_KEY, true);
export const AccountingOwnPassword = () => SetMetadata(ACCOUNTING_PASSWORD_KEY, true);
