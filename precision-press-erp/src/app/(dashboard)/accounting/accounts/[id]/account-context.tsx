"use client";

import { createContext, useContext } from "react";

export interface AccountDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: string;
  subType?: string | null;
  description?: string | null;
  currencyCode?: string;
  isActive?: boolean;
  isSystem?: boolean;
  totalDebits?: number;
  totalCredits?: number;
  entryCount?: number;
}

export interface AccountContextValue {
  account: AccountDetail | null;
  setAccount: (fn: (prev: AccountDetail | null) => AccountDetail | null) => void;
  refetch: () => void;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccountContext() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used within account layout");
  return ctx;
}
