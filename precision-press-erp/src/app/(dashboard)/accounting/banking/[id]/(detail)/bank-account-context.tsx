"use client";

import { createContext, useContext } from "react";
import type {
  BankAccountDetail,
  Transaction,
  StatementImport,
  BankAccountSummary,
} from "../_components";

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface BankAccountContextValue {
  account: BankAccountDetail;
  setAccount: (fn: (prev: BankAccountDetail | null) => BankAccountDetail | null) => void;
  transactions: Transaction[];
  imports: StatementImport[];
  refetch: () => void;
  // Transaction actions
  handleReconcile: (txId: string) => Promise<void>;
  handleExclude: (txId: string) => Promise<void>;
  handleUndo: (tx: Transaction) => Promise<void>;
  handleOpenMatch: (tx: Transaction) => void;
  handleOpenExpense: (tx: Transaction) => void;
  handleOpenCategorize: (tx: Transaction) => void;
  handleOpenMatchInvoice: (tx: Transaction) => void;
  // Unified actions
  handleOpenMatchUnified: (tx: Transaction) => void;
  handleOpenTransfer: (tx: Transaction) => void;
  handleOpenSplit: (tx: Transaction) => void;
  bankAccounts: BankAccountSummary[];
  // Import
  openImport: () => void;
  // Summary
  summary: {
    unreconciled: number;
    reconciled: number;
    excluded: number;
    credits: number;
    debits: number;
    total: number;
  };
}

export const BankAccountContext = createContext<BankAccountContextValue | null>(null);

export function useBankAccountContext(): BankAccountContextValue {
  const ctx = useContext(BankAccountContext);
  if (!ctx) throw new Error("useBankAccountContext must be used within bank account layout");
  return ctx;
}
