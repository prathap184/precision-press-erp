export interface LedgerEntry {
  id: string;

  customerId: string;
  orderId?: string;

  type: 'DEBIT' | 'CREDIT';

  entryType:
    | 'ORDER'
    | 'PAYMENT'
    | 'ADJUSTMENT'
    | 'OPENING_BALANCE';

  amount: number;

  debit?: number;
  credit?: number;

  runningBalance: number;

  narration: string;

  referenceNumber?: string;

  thumbnailUrl?: string;

  createdAt: string; // ISO String
  createdBy: string;
}
