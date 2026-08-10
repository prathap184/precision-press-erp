"use client";

import { Clock3, Upload, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useBankAccountContext } from "./bank-account-context";
import { TransactionRow, ImportRow } from "../_components";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";

interface JournalMovement {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function BankAccountOverviewPage() {
  const {
    account,
    transactions,
    imports,
    summary,
    handleReconcile,
    handleExclude,
    handleUndo,
    handleOpenMatch,
    handleOpenExpense,
    handleOpenCategorize,
    handleOpenMatchInvoice,
    handleOpenMatchUnified,
    handleOpenTransfer,
    handleOpenSplit,
    openImport,
  } = useBankAccountContext();

  useDocumentTitle("Accounting \u00B7 Bank Overview");

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cur = account.currencyCode;

  const [journalMovements, setJournalMovements] = useState<JournalMovement[]>([]);

  // Fetch recent journal movements for accounts with no imported transactions
  useEffect(() => {
    if (transactions.length > 0) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !id) return;

    const today = new Date().toISOString().split("T")[0];
    const yearStart = `${new Date().getFullYear()}-01-01`;

    fetch(`/api/v1/bank-accounts/${id}/ledger?from=${yearStart}&to=${today}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.lines && d.lines.length > 0) {
          setJournalMovements([...d.lines].reverse().slice(0, 8));
        }
      })
      .catch(() => {});
  }, [id, transactions.length]);

  function fmtDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch { return dateStr; }
  }

  return (
    <div className="space-y-8">
      {/* Reconciliation breakdown */}
      <div>
        <div className="flex items-center gap-6 text-[13px]">
          {[
            { label: "To do", count: summary.unreconciled, dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
            { label: "Done", count: summary.reconciled, dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
            { label: "Ignored", count: summary.excluded, dot: "bg-gray-400", text: "text-muted-foreground" },
          ].map(({ label, count, dot, text }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", dot)} />
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("font-mono font-semibold tabular-nums", text)}>{count}</span>
            </div>
          ))}
        </div>
        {summary.total > 0 && (
          <div className="mt-3 h-2.5 w-full rounded-full overflow-hidden flex bg-gray-200 dark:bg-muted">
            {summary.reconciled > 0 && (
              <div className="h-full bg-emerald-500" style={{ width: `${(summary.reconciled / summary.total) * 100}%` }} />
            )}
            {summary.unreconciled > 0 && (
              <div className="h-full bg-amber-500" style={{ width: `${(summary.unreconciled / summary.total) * 100}%` }} />
            )}
            {summary.excluded > 0 && (
              <div className="h-full bg-gray-400" style={{ width: `${(summary.excluded / summary.total) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Recent Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          journalMovements.length > 0 ? (
            // Show journal movements when no imported transactions exist
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3 px-1">
                <BookOpen className="size-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Showing journal movements — no imported statement yet
                </p>
              </div>
              <div className="rounded-lg border divide-y divide-border">
                {journalMovements.map((mv, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{mv.particulars}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(mv.date)} · {mv.vchType} {mv.vchNo}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {mv.debit > 0 && (
                        <p className="font-mono font-semibold text-sm text-emerald-600">
                          +{formatMoney(mv.debit, cur)}
                        </p>
                      )}
                      {mv.credit > 0 && (
                        <p className="font-mono font-semibold text-sm text-red-600">
                          -{formatMoney(mv.credit, cur)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatMoney(Math.abs(mv.balance), cur)} {mv.balance >= 0 ? "Dr" : "Cr"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => router.push(`/accounting/banking/${id}/ledger`)}
                >
                  View full ledger →
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
              <Clock3 className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Import a statement to get started.</p>
              </div>
              <Button size="sm" onClick={openImport} className="mt-2 bg-emerald-600 hover:bg-emerald-700">
                <Upload className="mr-2 size-3.5" />Import Statement
              </Button>
            </div>
          )
        ) : (
          <div className="rounded-lg border">
            {transactions.slice(0, 8).map((tx, i) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                cur={cur}
                isLast={i === Math.min(7, transactions.length - 1)}
                onReconcile={handleReconcile}
                onExclude={handleExclude}
                onMatchBill={handleOpenMatch}
                onCreateExpense={handleOpenExpense}
                onCategorize={handleOpenCategorize}
                onMatchInvoice={handleOpenMatchInvoice}
                onMatch={handleOpenMatchUnified}
                onTransfer={handleOpenTransfer}
                onSplit={handleOpenSplit}
                onUndo={handleUndo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent imports */}
      {imports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Recent Imports</h3>
          </div>
          <div className="rounded-lg border">
            {imports.slice(0, 3).map((imp, i) => (
              <ImportRow key={imp.id} imp={imp} isLast={i === Math.min(2, imports.length - 1)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
