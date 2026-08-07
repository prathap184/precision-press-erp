"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Plus, Eye, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

interface Entry {
  id: string;
  entryNumber: string | null;
  voucherNumber?: string | null;
  date: string;
  description: string;
  reference: string | null;
  status: string;
  totalDebit: number;
}

export default function JournalRegistryPage() {
  const router = useRouter();
  useDocumentTitle("Accounting · Journal Registry");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/entries?type=JOURNAL", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.entries) {
          setEntries(data.entries);
        }
      })
      .catch((err) => {
        console.error("Failed to load entries", err);
        toast.error("Failed to load entries");
      })
      .finally(() => setLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filteredEntries = entries.filter((e) => {
    const voucherNo = String(e.voucherNumber || e.entryNumber || "").toLowerCase();
    const desc = String(e.description || "").toLowerCase();
    const ref = String(e.reference || "").toLowerCase();
    return voucherNo.includes(q) || desc.includes(q) || ref.includes(q);
  });

  if (loading) return <BrandLoader />;

  return (
    <div className="h-full w-full py-6 space-y-6">
      <div className="px-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal Registry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View all non-cash adjustments, depreciation, and transfers.
          </p>
        </div>
        <Button onClick={() => router.push("/accounting/journal")}>
          <Plus className="h-4 w-4 mr-2" />
          Create Journal Voucher
        </Button>
      </div>

      <div className="px-6">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by voucher no, narration, or reference..."
                className="pl-9 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Voucher No</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Narration</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="h-8 w-8 text-slate-300" />
                        <p>No journal vouchers found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">{entry.date}</td>
                      <td className="px-4 py-3 font-medium">{entry.voucherNumber || entry.entryNumber || "-"}</td>
                      <td className="px-4 py-3">{entry.reference || "-"}</td>
                      <td className="px-4 py-3 max-w-xs truncate" title={entry.description}>{entry.description}</td>
                      <td className="px-4 py-3">
                        <Badge 
                          variant={entry.status === 'posted' ? 'default' : entry.status === 'draft' ? 'outline' : 'secondary'}
                          className={entry.status === 'posted' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                        >
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ₹{(parseFloat(String(entry.totalDebit || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => toast.info("Preview not yet built")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
