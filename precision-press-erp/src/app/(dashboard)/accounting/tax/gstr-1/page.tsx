"use client";

import { useState, useEffect } from "react";
import { ArrowUpRight, Printer } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import Link from "next/link";

export default function Gstr1Page() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useDocumentTitle("Tax · GSTR-1");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate, endDate });

    setLoading(true);
    fetch(`/api/v1/reports/gstr-1?${params}`, {
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

  const renderInvoiceTable = (invoices: any[], title: string) => {
    if (!invoices || invoices.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">{title}</h3>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b">
              <tr>
                <th className="h-10 px-4 text-left font-medium">Invoice No</th>
                <th className="h-10 px-4 text-left font-medium">Date</th>
                <th className="h-10 px-4 text-left font-medium">Customer</th>
                <th className="h-10 px-4 text-left font-medium">GSTIN</th>
                <th className="h-10 px-4 text-right font-medium">Taxable Value</th>
                <th className="h-10 px-4 text-right font-medium">CGST</th>
                <th className="h-10 px-4 text-right font-medium">SGST</th>
                <th className="h-10 px-4 text-right font-medium">IGST</th>
                <th className="h-10 px-4 text-right font-medium">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-4">{inv.invoiceNumber}</td>
                  <td className="p-4">{inv.issueDate}</td>
                  <td className="p-4">{inv.customerName}</td>
                  <td className="p-4">{inv.taxNumber || "-"}</td>
                  <td className="p-4 text-right">{formatMoney(inv.subtotal, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(inv.cgstTotal, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(inv.sgstTotal, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(inv.igstTotal, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(inv.taxTotal, "INR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHsnTable = (hsnList: any[]) => {
    if (!hsnList || hsnList.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">HSN-wise Summary</h3>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b">
              <tr>
                <th className="h-10 px-4 text-left font-medium">HSN Code</th>
                <th className="h-10 px-4 text-right font-medium">Taxable Value</th>
                <th className="h-10 px-4 text-right font-medium">CGST</th>
                <th className="h-10 px-4 text-right font-medium">SGST</th>
                <th className="h-10 px-4 text-right font-medium">IGST</th>
                <th className="h-10 px-4 text-right font-medium">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {hsnList.map((item, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-4 font-medium">{item.hsnCode}</td>
                  <td className="p-4 text-right">{formatMoney(item.taxableValue, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(item.cgst, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(item.sgst, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(item.igst, "INR")}</td>
                  <td className="p-4 text-right">{formatMoney(item.totalTax, "INR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="GSTR-1"
        description="Outward supplies summary for GST filing."
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
          {renderInvoiceTable(data.b2b, "B2B Supplies (Registered)")}
          {renderInvoiceTable(data.b2cLarge, "B2C Large (Inter-state > ₹2.5L)")}
          {renderInvoiceTable(data.b2cSmall, "B2C Small (Others)")}
          {renderHsnTable(data.hsn)}

          {!data.b2b?.length && !data.b2cLarge?.length && !data.b2cSmall?.length && !data.hsn?.length && (
            <div className="py-12 text-center text-muted-foreground border rounded-lg bg-card border-dashed">
              No outward supplies found for this period.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
