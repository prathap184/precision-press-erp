"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JournalForm } from "@/components/dashboard/journal-form";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Contact {
  id: string;
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

export default function JournalVoucherPage() {
  const router = useRouter();
  useDocumentTitle("Accounting · New Journal Voucher");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    Promise.all([
      fetch("/api/v1/accounts", { headers: { "x-organization-id": orgId } }).then((res) => res.json()),
      fetch("/api/v1/contacts?limit=1000", { headers: { "x-organization-id": orgId } }).then((res) => res.json()),
      fetch("/api/v1/cost-centers", { headers: { "x-organization-id": orgId } }).then((res) => res.json()),
      fetch("/api/v1/projects", { headers: { "x-organization-id": orgId } }).then((res) => res.json())
    ])
      .then(([accountsData, contactsData, costCentersData, projectsData]) => {
        if (accountsData.accounts) setAccounts(accountsData.accounts);
        if (contactsData.data) setContacts(contactsData.data);
        if (costCentersData.costCenters) setCostCenters(costCentersData.costCenters);
        if (projectsData.projects) setProjects(projectsData.projects);
      })
      .catch((err) => {
        console.error("Failed to load data", err);
        toast.error("Failed to load necessary data");
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

      toast.success("Journal voucher created successfully");
      router.push("/accounting/entries"); // Adjust redirect path as needed
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <BrandLoader />;

  return (
    <div className="h-full w-full py-6 space-y-6">
      <div className="px-6">
        <h1 className="text-2xl font-bold tracking-tight">Journal Voucher</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Record non-cash adjustments like depreciation, bad debts, and balance transfers.
        </p>
      </div>

      <div className="px-6">
        <JournalForm
          accounts={accounts}
          contacts={contacts}
          costCenters={costCenters}
          projects={projects}
          onSubmit={handleSubmit}
          loading={submitting}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
