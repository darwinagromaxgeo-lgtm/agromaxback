import { StockAdjustmentEntity } from './stock-adjustment.entity';

export interface StockAdjustmentItem {
  productId: string;
  type: 'INCREASE' | 'DECREASE' | 'SET';
  quantity: number;
  expectedQuantity?: number;
  lotNumber?: string;
  expirationDate?: string;
}

export interface StockAdjustmentBatch {
  companyId: string;
  requestId: string;
  reason: string;
  items: StockAdjustmentItem[];
}

export interface StockAdjustmentBatchResult {
  requestId: string;
  adjustments: StockAdjustmentEntity[];
  unchangedProductIds: string[];
}
