"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccountContext } from "./account-context";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface LedgerLine {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
}

interface AccountLedgerResponse {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    currencyCode?: string;
    openingBalance?: string;
    openingBalanceType?: string;
  };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: LedgerLine[];
}

function fmt(amount: number, cur: string) {
  return formatMoney(Math.abs(amount), cur);
}

function drCr(amount: number, accountType: string = "asset") {
  if (["asset", "expense"].includes(accountType)) {
    return amount >= 0 ? "Dr" : "Cr";
  }
  return amount >= 0 ? "Cr" : "Dr";
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatVchType(sourceType?: string) {
  if (!sourceType) return "Journal";
  const s = sourceType.toLowerCase();
  if (s.includes("invoice") || s.includes("sales")) return "Sales";
  if (s.includes("receipt")) return "Receipt";
  if (s.includes("payment")) return "Payment";
  if (s.includes("contra")) return "Contra";
  return "Journal";
}

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useAccountContext();
  const cur = account?.currencyCode || "INR";
  const accountType = account?.type || "asset";

  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<AccountLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useDocumentTitle(`Accounting \u00B7 Ledger - ${account?.name || "Account"}`);

  const fetchLedger = useCallback(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId || !id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "200");
    fetch(`/api/v1/accounts/${id}?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, from, to]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const dateRangeLabel =
    from && to
      ? `${fmtDate(from)} to ${fmtDate(to)}`
      : from
      ? `From ${fmtDate(from)}`
      : to
      ? `To ${fmtDate(to)}`
      : "All dates";

  return (
    <div className="font-mono text-sm shadow-sm rounded-lg overflow-hidden border border-[#c8b87a]">
      {/* Green Header Bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 mb-0"
        style={{ background: "#1b4332", color: "#f4ebd0" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-base tracking-wide">Ledger Vouchers</span>
          {account && (
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-700/50 text-[#f4ebd0]">
              Ledger: {account.name} ({account.code})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-80">{dateRangeLabel}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-400 text-amber-300 bg-transparent hover:bg-amber-900"
            onClick={() => window.print()}
          >
            <Printer className="size-3 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-2"
        style={{ background: "#f4ebd0", borderBottom: "1px solid #c8b87a" }}
      >
        <span className="text-xs font-semibold text-slate-700">Date Range:</span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-600">From</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 text-xs w-36 bg-white border-slate-300"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-600">To</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 text-xs w-36 bg-white border-slate-300"
          />
        </div>
        <Button
          size="sm"
          className="h-7 text-xs"
          style={{ background: "#1b4332", color: "#f4ebd0" }}
          onClick={fetchLedger}
        >
          Show
        </Button>
      </div>

      {/* Table */}
      <div style={{ background: "#fffdf5", minHeight: 400 }}>
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            Loading ledger vouchers…
          </div>
        )}

        {!loading && data && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "#e8d9a0", borderBottom: "2px solid #c8b87a" }}>
                <th className="text-left px-3 py-2 font-semibold w-24">Date</th>
                <th className="text-left px-3 py-2 font-semibold">Particulars</th>
                <th className="text-center px-3 py-2 font-semibold w-28">Vch Type</th>
                <th className="text-center px-3 py-2 font-semibold w-28">Vch No.</th>
                <th className="text-right px-3 py-2 font-semibold w-28">Debit</th>
                <th className="text-right px-3 py-2 font-semibold w-28">Credit</th>
                <th className="text-right px-3 py-2 font-semibold w-32">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening Balance Row */}
              <tr style={{ background: "#f9f3dc", borderBottom: "1px solid #e2d08a" }}>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 font-semibold text-slate-800">Opening Balance</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right" />
                <td className="px-3 py-1.5 text-right" />
                <td className="px-3 py-1.5 text-right font-semibold text-slate-800">
                  {fmt(data.openingBalance, cur)}{" "}
                  <span className="text-[10px] text-slate-500 font-bold">
                    {drCr(data.openingBalance, accountType)}
                  </span>
                </td>
              </tr>

              {/* Transaction Lines */}
              {(!data.lines || data.lines.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    No transactions in this date range.
                  </td>
                </tr>
              )}
              {data.lines &&
                data.lines.map((line, i) => (
                  <tr
                    key={line.entryId || i}
                    style={{
                      background: i % 2 === 0 ? "#fffdf5" : "#f9f3dc",
                      borderBottom: "1px solid #ede3b4",
                    }}
                  >
                    <td className="px-3 py-1 text-slate-600">{fmtDate(line.date)}</td>
                    <td className="px-3 py-1 text-slate-800 max-w-xs truncate">{line.description}</td>
                    <td className="px-3 py-1 text-center text-slate-600">{formatVchType(line.sourceType)}</td>
                    <td className="px-3 py-1 text-center text-slate-600 font-mono">
                      <a
                        href={`/accounting/${line.entryId}`}
                        className="text-emerald-700 hover:underline font-bold"
                      >
                        {line.entryNumber || `#${i + 1}`}
                      </a>
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {line.debitAmount > 0 ? (
                        <span className="text-slate-800">{fmt(line.debitAmount, cur)}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {line.creditAmount > 0 ? (
                        <span className="text-slate-800">{fmt(line.creditAmount, cur)}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums font-medium">
                      <span className={line.balance >= 0 ? "text-emerald-700" : "text-red-700"}>
                        {fmt(line.balance, cur)}
                      </span>{" "}
                      <span className="text-[10px] text-slate-400 font-bold">
                        {drCr(line.balance, accountType)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>

            {/* Footer Totals */}
            <tfoot>
              <tr style={{ background: "#e8d9a0", borderTop: "2px solid #c8b87a" }}>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 font-semibold text-slate-700">Current Total</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                  {fmt(data.totalDebit, cur)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                  {fmt(data.totalCredit, cur)}
                </td>
                <td className="px-3 py-2" />
              </tr>
              <tr style={{ background: "#d4c87a", borderTop: "1px solid #b8a055" }}>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 font-bold text-slate-900">Closing Balance</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums text-sm">
                  {fmt(data.closingBalance, cur)}{" "}
                  <span className="text-xs font-semibold">
                    {drCr(data.closingBalance, accountType)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {!loading && !data && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            Select a date range and click Show.
          </div>
        )}
      </div>
    </div>
  );
}
