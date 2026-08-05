"use client";

import { useState, useEffect } from "react";
import { ArrowUpRight, Printer } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import Link from "next/link";

export default function Gstr3bPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useDocumentTitle("Tax · GSTR-3B");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate, endDate });

    setLoading(true);
    fetch(`/api/v1/reports/gstr-3b?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const renderSection = (title: string, summary: any) => {
    if (!summary) return null;
    return (
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">{title}</h3>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b">
              <tr>
                <th className="h-10 px-4 text-left font-medium">Description</th>
                <th className="h-10 px-4 text-right font-medium">Taxable Value</th>
                <th className="h-10 px-4 text-right font-medium">CGST</th>
                <th className="h-10 px-4 text-right font-medium">SGST</th>
                <th className="h-10 px-4 text-right font-medium">IGST</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-muted/30">
                <td className="p-4 font-medium">Total</td>
                <td className="p-4 text-right">{formatMoney(summary.taxableValue || 0, "INR")}</td>
                <td className="p-4 text-right">{formatMoney(summary.cgst || 0, "INR")}</td>
                <td className="p-4 text-right">{formatMoney(summary.sgst || 0, "INR")}</td>
                <td className="p-4 text-right">{formatMoney(summary.igst || 0, "INR")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-3B"
        description="Monthly summary of outward supplies and ITC."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
          <Link href="/tax/periods">
            <ArrowUpRight className="size-3.5" />
            Tax Periods
          </Link>
        </Button>
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <BrandLoader />
        </div>
      ) : data ? (
        <div className="space-y-8">
          {renderSection("3.1 Outward supplies (Sales)", data.outward)}
          {renderSection("4. Eligible ITC (Purchases)", data.inward)}
          
          <div className="mt-8 p-6 bg-muted/20 border rounded-lg">
            <h4 className="font-medium text-lg mb-4">Tax Liability vs ITC Summary</h4>
            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Net CGST Payable</div>
                <div className="text-2xl font-semibold">
                  {formatMoney(Math.max(0, (data.outward?.cgst || 0) - (data.inward?.cgst || 0)), "INR")}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Net SGST Payable</div>
                <div className="text-2xl font-semibold">
                  {formatMoney(Math.max(0, (data.outward?.sgst || 0) - (data.inward?.sgst || 0)), "INR")}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Net IGST Payable</div>
                <div className="text-2xl font-semibold">
                  {formatMoney(Math.max(0, (data.outward?.igst || 0) - (data.inward?.igst || 0)), "INR")}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
