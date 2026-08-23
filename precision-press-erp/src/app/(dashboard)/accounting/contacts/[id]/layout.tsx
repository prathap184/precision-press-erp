"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  BookOpen,
  Users,
  Activity,
  BarChart3,
  Paperclip,
  Target,
  Merge,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { centsToDecimal } from "@/lib/money";
import { getOrgId } from "@/lib/org-helper";
import {
  ContactContext,
  type ContactDetail,
} from "./contact-context";

// Re-export types so child pages that import from "./layout" or "../layout" still work
export type {
  ContactContextValue,
  ActivityItem,
  ContactDetail,
  ContactFile,
  ContactPerson,
  Account,
  TaxRate,
} from "./contact-context";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { value: "details", label: "Details", icon: FileText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "statement", label: "Statement", icon: BarChart3 },
  { value: "bookkeeping", label: "Bookkeeping", icon: BookOpen },
  { value: "people", label: "People", icon: Users },
  { value: "files", label: "Files", icon: Paperclip },
] as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ContactDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { open: openDrawer } = useCreateDrawer();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Shared form state
  const [formType, setFormType] = useState<string>("customer");
  const [formRevenueAccountId, setFormRevenueAccountId] = useState<string>("none");
  const [formExpenseAccountId, setFormExpenseAccountId] = useState<string>("none");
  const [formTaxRateId, setFormTaxRateId] = useState<string>("none");
  const [formTaxExempt, setFormTaxExempt] = useState(false);
  const [form1099Vendor, setForm1099Vendor] = useState(false);
  const [formCreditLimit, setFormCreditLimit] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("");
  const [formOpeningBalance, setFormOpeningBalance] = useState("");
  const [formOpeningBalanceType, setFormOpeningBalanceType] = useState("Dr");
  const [saving, setSaving] = useState(false);

  // "Merge duplicates" dialog
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<
    { id: string; name: string; email: string | null }[]
  >([]);
  const [merging, setMerging] = useState(false);

  useEntityTitle(contact?.name ?? undefined);

  // Search other contacts to pick the duplicate to fold into this one.
  useEffect(() => {
    if (!mergeOpen) return;
    const orgId = getOrgId();
    if (!orgId) return;
    const params = new URLSearchParams();
    if (mergeSearch) params.set("search", mergeSearch);
    params.set("limit", "20");
    const handle = setTimeout(() => {
      fetch(`/api/v1/contacts?${params}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.data) {
            setMergeResults(
              data.data.filter(
                (c: { id: string }) => c.id !== id
              )
            );
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [mergeOpen, mergeSearch, id]);

  // Fold the picked duplicate INTO the contact being viewed (this one survives).
  async function handleMerge(duplicateId: string, duplicateName: string) {
    const orgId = getOrgId();
    if (!orgId || !contact) return;
    const confirmed = await confirm({
      title: `Combine "${duplicateName}" into "${contact.name}"?`,
      description:
        "All invoices, bills, payments and other records from the duplicate will be moved onto this contact. The duplicate is then removed. This can't be undone.",
      confirmLabel: "Combine them",
      destructive: true,
    });
    if (!confirmed) return;
    setMerging(true);
    try {
      const res = await fetch(`/api/v1/contacts/${duplicateId}/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ targetContactId: contact.id }),
      });
      if (res.ok) {
        toast.success("Duplicate combined into this contact");
        setMergeOpen(false);
        setMergeSearch("");
        fetchContact();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Couldn't combine the contacts"
        );
      }
    } finally {
      setMerging(false);
    }
  }

  const fetchContact = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/contacts/${id}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.contact) {
        const c = data.contact as ContactDetail;
        setContact(c);
        setFormType(c.type);
        setFormRevenueAccountId(c.defaultRevenueAccountId || "none");
        setFormExpenseAccountId(c.defaultExpenseAccountId || "none");
        setFormTaxRateId(c.defaultTaxRateId || "none");
        setFormTaxExempt(c.isTaxExempt);
        setForm1099Vendor(c.is1099Vendor ?? false);
        setFormCreditLimit(c.creditLimit != null ? centsToDecimal(c.creditLimit) : "");
        setFormCurrencyCode(c.currencyCode || "");
        setFormOpeningBalance(c.openingBalance != null ? String(c.openingBalance) : "");
        setFormOpeningBalanceType(c.openingBalanceType || "Dr");
      }
    } catch {
      toast.error("Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const activeTab = pathname.endsWith("/activity") ? "activity"
    : pathname.endsWith("/statement") ? "statement"
    : pathname.endsWith("/bookkeeping") ? "bookkeeping"
    : pathname.endsWith("/people") ? "people"
    : pathname.endsWith("/files") ? "files"
    : "details";

  if (loading) return <BrandLoader />;

  if (!contact) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This contact does not exist or has been deleted.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push("/contacts")}>
          Back to Contacts
        </Button>
      </div>
    );
  }

  const peopleCount = contact.people?.length ?? 0;

  return (
    <ContactContext.Provider
      value={{
        contact,
        setContact,
        fetchContact,
        confirm,
        confirmDialog,
        formType,
        setFormType,
        formRevenueAccountId,
        setFormRevenueAccountId,
        formExpenseAccountId,
        setFormExpenseAccountId,
        formTaxRateId,
        setFormTaxRateId,
        formTaxExempt,
        setFormTaxExempt,
        form1099Vendor,
        setForm1099Vendor,
        formCreditLimit,
        setFormCreditLimit,
        formCurrencyCode,
        setFormCurrencyCode,
        formOpeningBalance,
        setFormOpeningBalance,
        formOpeningBalanceType,
        setFormOpeningBalanceType,
        saving,
        setSaving,
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/contacts")}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to contacts
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setMergeOpen(true)}
              title="Found the same contact entered twice? Combine the other one's records into this contact and remove the duplicate."
            >
              <Merge className="size-3" />
              Merge duplicates
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => openDrawer("deal", { contactId: contact.id, contactName: contact.name })}
              title="Start tracking a potential sale with this contact"
            >
              <Target className="size-3" />
              Add a sales opportunity
            </Button>
          </div>
        </div>

        {/* Merge duplicates */}
        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge a duplicate into this contact</DialogTitle>
              <DialogDescription>
                Pick the other contact that&apos;s the same as this one. Its
                invoices, bills, payments and notes move onto{" "}
                <span className="font-medium">{contact.name}</span>, and the
                duplicate is removed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search for the duplicate contact..."
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {mergeResults.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    No other contacts found.
                  </p>
                ) : (
                  mergeResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={merging}
                      onClick={() => handleMerge(c.id, c.name)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {c.name}
                        </span>
                        {c.email && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.email}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-emerald-600">
                        Merge in
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tab nav */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.value === "details" ? `/contacts/${id}` : `/contacts/${id}/${t.value}`;
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
                {t.value === "people" && peopleCount > 0 && (
                  <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
                    {peopleCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <ContentReveal key={pathname}>
          {children}
        </ContentReveal>

        {confirmDialog}
      </div>
    </ContactContext.Provider>
  );
}
