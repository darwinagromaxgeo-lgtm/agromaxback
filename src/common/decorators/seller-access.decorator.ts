import { SetMetadata } from '@nestjs/common';

export const SELLER_ACCESS_KEY = 'sellerAccess';
/** Explicitly expose a sales operation or the read-only data needed by POS. */
export const SellerAccess = () => SetMetadata(SELLER_ACCESS_KEY, true);
