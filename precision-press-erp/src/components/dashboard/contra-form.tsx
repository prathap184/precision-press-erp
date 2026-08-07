"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { decimalToCents } from "@/lib/money";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface CostCenter {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

interface Line {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  instrumentType?: string;
  instrumentNo?: string;
  instrumentDate?: string;
}

interface ContraFormProps {
  accounts: Account[];
  onSubmit: (data: {
    date: string;
    description: string;
    reference: string;
    voucherType: string;
    status: "draft" | "pending_approval" | "posted";
    lines: {
      accountId: string;
      description: string;
      debitAmount: number;
      creditAmount: number;
      instrumentType?: string;
      instrumentNo?: string;
      instrumentDate?: string;
    }[];
  }) => void;
  loading?: boolean;
  initial?: {
    date: string;
    description: string;
    reference: string;
    status?: "draft" | "pending_approval" | "posted";
    lines: Line[];
  };
  onCancel?: () => void;
  submitLabel?: string;
  organizationName?: string;
  fiscalYearName?: string;
}

export function ContraForm({ 
  accounts, 
  onSubmit, 
  loading, 
  initial, 
  onCancel, 
  submitLabel,
  organizationName = "My Organization",
  fiscalYearName = "Current FY"
}: ContraFormProps) {
  const [date, setDate] = useState(initial?.date || new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState(initial?.description || "");
  const [reference, setReference] = useState(initial?.reference || "");
  const [status] = useState(initial?.status || "draft");
  
  const [lines, setLines] = useState<Line[]>(
    initial?.lines || [
      { accountId: "", description: "", debit: "", credit: "", instrumentType: "Cash" },
      { accountId: "", description: "", debit: "", credit: "", instrumentType: "Cash" },
    ]
  );

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.0001 && totalDebit > 0;
  const hasMinLines = lines.length >= 2;

  // STRICT Contra filtering: Only Cash & Bank allowed. 
  const contraAccounts = accounts.filter(a => 
    a.name.toLowerCase().includes('cash') || 
    a.name.toLowerCase().includes('bank')
  );

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i === index) {
          const newLine = { ...l, [field]: value };
          // Auto-clear opposite side
          if (field === 'debit' && parseFloat(value) > 0) newLine.credit = "";
          if (field === 'credit' && parseFloat(value) > 0) newLine.debit = "";
          
          // Clear instrument details if changed to Cash
          if (field === 'instrumentType' && value === 'Cash') {
            newLine.instrumentNo = "";
            newLine.instrumentDate = "";
          }
          
          return newLine;
        }
        return l;
      })
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { accountId: "", description: "", debit: "", credit: "", instrumentType: "Cash" },
    ]);
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(actionStatus: "draft" | "pending_approval" | "posted") {
    if ((!isBalanced || !hasMinLines) && actionStatus !== "draft") return;
    onSubmit({
      date,
      description,
      reference,
      voucherType: "CONTRA",
      status: actionStatus,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debitAmount: decimalToCents(l.debit),
        creditAmount: decimalToCents(l.credit),
        instrumentType: l.instrumentType || undefined,
        instrumentNo: l.instrumentNo || undefined,
        instrumentDate: l.instrumentDate || undefined,
      })),
    });
  }

  const getStatusColor = (s: string) => {
    switch (s) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "pending_approval": return "bg-amber-100 text-amber-800";
      case "posted": return "bg-emerald-100 text-emerald-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6 pb-4 border-b bg-muted/20">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Contra Voucher</h3>
            <Badge variant="outline" className={cn("capitalize", getStatusColor(status))}>
              {status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Voucher No</p>
            <p className="font-medium">Draft</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Voucher Date</p>
            <p className="font-medium">{date || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Posting Date</p>
            <p className="font-medium">Today</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Financial Year</p>
            <p className="font-medium">{fiscalYearName}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Organization</p>
            <p className="font-medium">{organizationName}</p>
          </div>
        </div>
      </div>

      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSubmit("posted"); }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TRF-001"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Narration</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cash deposited to Bank"
              required
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border shadow-sm">
            <div className="grid min-w-[1000px] grid-cols-[200px_1fr_120px_150px_120px_120px_120px_40px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Cash/Bank Account</span>
              <span>Line Narration</span>
              <span>Inst. Type</span>
              <span>Inst. No / Ref</span>
              <span>Inst. Date</span>
              <span className="text-right">Debit (₹)</span>
              <span className="text-right">Credit (₹)</span>
              <span />
            </div>
            {lines.map((line, i) => {
              const showInstDetails = line.instrumentType && line.instrumentType !== "Cash";
              return (
                <div
                  key={i}
                  className="grid min-w-[1000px] grid-cols-[200px_1fr_120px_150px_120px_120px_120px_40px] gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/10 transition-colors items-center"
                >
                  <Select
                    value={line.accountId}
                    onValueChange={(v) => updateLine(i, "accountId", v)}
                  >
                    <SelectTrigger className="h-8 text-sm bg-background">
                      <SelectValue placeholder="Select Cash/Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {contraAccounts.length === 0 && (
                        <SelectItem value="none" disabled>No Cash/Bank found</SelectItem>
                      )}
                      {contraAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-sm bg-background"
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    placeholder="Remarks..."
                  />
                  <Select
                    value={line.instrumentType || "Cash"}
                    onValueChange={(v) => updateLine(i, "instrumentType", v)}
                  >
                    <SelectTrigger className="h-8 text-sm bg-background">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="NEFT">NEFT</SelectItem>
                      <SelectItem value="RTGS">RTGS</SelectItem>
                      <SelectItem value="IMPS">IMPS</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {showInstDetails ? (
                    <Input
                      className="h-8 text-sm bg-background"
                      value={line.instrumentNo || ""}
                      onChange={(e) => updateLine(i, "instrumentNo", e.target.value)}
                      placeholder={line.instrumentType === "Cheque" ? "Cheque No" : (line.instrumentType === "UPI" ? "UPI Ref" : "UTR/Ref No")}
                    />
                  ) : (
                    <div className="h-8 bg-muted/30 rounded flex items-center justify-center text-xs text-muted-foreground">-</div>
                  )}

                  {showInstDetails ? (
                    <Input
                      className="h-8 text-sm bg-background"
                      type="date"
                      value={line.instrumentDate || ""}
                      onChange={(e) => updateLine(i, "instrumentDate", e.target.value)}
                    />
                  ) : (
                    <div className="h-8 bg-muted/30 rounded flex items-center justify-center text-xs text-muted-foreground">-</div>
                  )}

                  <CurrencyInput
                    size="sm"
                    value={line.debit}
                    onChange={(v) => updateLine(i, "debit", v)}
                    className="bg-background text-right"
                    disabled={parseFloat(line.credit || "0") > 0}
                  />
                  <CurrencyInput
                    size="sm"
                    value={line.credit}
                    onChange={(v) => updateLine(i, "credit", v)}
                    className="bg-background text-right"
                    disabled={parseFloat(line.debit || "0") > 0}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 2}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-lg border">
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="text-xs"
              >
                <Plus className="mr-1 size-3" />
                Add Line
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-6 text-sm text-right w-full sm:w-auto">
              <div>
                <p className="text-muted-foreground mb-1">Total Debit</p>
                <p className="font-mono font-semibold text-base">₹{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Total Credit</p>
                <p className="font-mono font-semibold text-base">₹{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Difference</p>
                <p className={cn("font-mono font-semibold text-base", !isBalanced && diff > 0 ? "text-destructive" : "")}>
                  ₹{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end flex-col items-end gap-2">
             {!hasMinLines && (
               <div className="flex items-center text-destructive bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20 w-fit">
                 <AlertCircle className="size-4 mr-2" />
                 <span className="text-sm font-medium">Contra vouchers must have at least 2 lines.</span>
               </div>
             )}
             {isBalanced ? (
               <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200 w-fit">
                 <CheckCircle2 className="size-4 mr-2" />
                 <span className="text-sm font-medium">Voucher Balanced</span>
               </div>
             ) : (
               <div className="flex items-center text-destructive bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20 w-fit">
                 <AlertCircle className="size-4 mr-2" />
                 <span className="text-sm font-medium">Debit and Credit totals do not match. Difference: ₹{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
               </div>
             )}
          </div>
        </div>

        {/* Attachments UI Placeholder */}
        <div className="rounded-lg border p-4">
           <div className="flex items-center justify-between mb-2">
             <Label>Attachments</Label>
           </div>
           <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
             <FileUp className="size-6 mb-2 opacity-50" />
             <p className="text-sm font-medium">Drop PDF here</p>
             <p className="text-xs">Maximum 10 MB</p>
             <p className="text-xs mt-2 italic">(No files uploaded)</p>
           </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row justify-between items-center pt-4 border-t">
          <div className="w-full sm:w-auto">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">Close</Button>
            ) : (
              <Button type="button" variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/transactions">Close</Link>
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => handleSubmit("draft")}
              className="w-full sm:w-auto"
            >
              Save Draft
            </Button>
            <Button
              type="button"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              disabled={!isBalanced || loading}
              onClick={() => handleSubmit("pending_approval")}
            >
              Submit for Approval
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={!isBalanced || loading}
              onClick={() => handleSubmit("posted")}
              className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
            >
              {loading ? "Posting..." : "Post Voucher"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
