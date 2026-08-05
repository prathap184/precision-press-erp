"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useBankAccountContext } from "../bank-account-context";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Download } from "lucide-react";

interface LedgerLine {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerData {
  accountName: string;
  accountType: string;
  currencyCode: string;
  openingBalance: number;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

function fmt(amount: number, cur: string) {
  return formatMoney(Math.abs(amount), cur);
}

function drCr(amount: number) {
  return amount >= 0 ? "Dr" : "Cr";
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function BankLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useBankAccountContext();
  const cur = account?.currencyCode || "INR";

  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLedger = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/v1/bank-accounts/${id}/ledger?${params}`, {
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
    <div className="font-mono text-sm">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2 mb-0"
        style={{ background: "#1b4332", color: "#f4ebd0" }}
      >
        <div>
          <span className="font-bold text-base tracking-wide">Ledger Vouchers</span>
          {data && (
            <span className="ml-4 text-xs opacity-80">
              Ledger: {data.accountName}
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

      {/* Date filter bar */}
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
            Loading ledger…
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
              {/* Opening Balance row */}
              <tr style={{ background: "#f9f3dc", borderBottom: "1px solid #e2d08a" }}>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 font-semibold text-slate-800">Opening Balance</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right" />
                <td className="px-3 py-1.5 text-right" />
                <td className="px-3 py-1.5 text-right font-semibold text-slate-800">
                  {fmt(data.openingBalance, cur)}{" "}
                  <span className="text-[10px] text-slate-500">{drCr(data.openingBalance)}</span>
                </td>
              </tr>

              {/* Transaction lines */}
              {data.lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    No transactions in this date range.
                  </td>
                </tr>
              )}
              {data.lines.map((line, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "#fffdf5" : "#f9f3dc",
                    borderBottom: "1px solid #ede3b4",
                  }}
                >
                  <td className="px-3 py-1 text-slate-600">{fmtDate(line.date)}</td>
                  <td className="px-3 py-1 text-slate-800 max-w-xs truncate">{line.particulars}</td>
                  <td className="px-3 py-1 text-center text-slate-600">{line.vchType}</td>
                  <td className="px-3 py-1 text-center text-slate-600 font-mono">{line.vchNo}</td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {line.debit > 0 ? (
                      <span className="text-slate-800">{fmt(line.debit, cur)}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {line.credit > 0 ? (
                      <span className="text-slate-800">{fmt(line.credit, cur)}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums font-medium">
                    <span className={line.balance >= 0 ? "text-emerald-700" : "text-red-700"}>
                      {fmt(line.balance, cur)}
                    </span>{" "}
                    <span className="text-[10px] text-slate-400">{drCr(line.balance)}</span>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer totals */}
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
                  <span className="text-xs font-semibold">{drCr(data.closingBalance)}</span>
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
