"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContraForm } from "@/components/dashboard/contra-form";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export default function ContraVoucherPage() {
  const router = useRouter();
  useDocumentTitle("Accounting · New Contra Voucher");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.accounts) {
          // STRICT RULE: Contra is only for Cash & Bank
          const contraAccounts = data.accounts.filter(
            (a: Account) => a.type === "cash" || a.type === "bank"
          );
          setAccounts(contraAccounts);
        }
      })
      .catch((err) => {
        console.error("Failed to load accounts", err);
        toast.error("Failed to load accounts");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (data: any) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create voucher");
      }

      toast.success("Contra voucher created successfully");
      router.push("/accounting/entries"); // Or wherever the transaction list is
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <BrandLoader />;

  return (
    <div className="mx-auto max-w-4xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contra Voucher</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record cash deposits, cash withdrawals, and bank-to-bank transfers. (Only Cash & Bank ledgers allowed).
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <ContraForm
          accounts={accounts}
          onSubmit={handleSubmit}
          loading={submitting}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
