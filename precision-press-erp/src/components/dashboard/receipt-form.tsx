"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";

interface BankAccountOption {
  id: string;
  accountName: string;
  chartAccountId?: string;
  currencyCode: string;
  balance?: number;
  accountType?: string;
}

interface CustomerOption {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  owesYou?: number;
  youOwe?: number;
  currencyCode?: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  issueDate?: string;
  dueDate?: string;
  amountDue: number;
  total: number;
  currencyCode: string;
}

export type RefType = "ADVANCE" | "AGST_REF" | "NEW_REF" | "ON_ACCOUNT";

export interface BillWiseLine {
  id: string;
  refType: RefType;
  refName: string;
  dueDate: string;
  amount: number;
  invoiceId?: string;
  drCr: "Dr" | "Cr";
}

function formatTallyDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { dateDisplay: dateStr, dayDisplay: "" };
    const day = d.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    const weekday = days[d.getDay()];
    return {
      dateDisplay: `${day}-${month}-${year}`,
      dayDisplay: weekday,
    };
  } catch {
    return { dateDisplay: dateStr, dayDisplay: "" };
  }
}

const REF_TYPE_OPTIONS: { type: RefType; label: string }[] = [
  { type: "ADVANCE", label: "Advance" },
  { type: "AGST_REF", label: "Agst Ref" },
  { type: "NEW_REF", label: "New Ref" },
  { type: "ON_ACCOUNT", label: "On Account" },
];

export function ReceiptForm() {
  const router = useRouter();

  // Organization & General Info
  const [orgName, setOrgName] = useState("Hindustan Enterprises");
  const [voucherNo, setVoucherNo] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [showF2Modal, setShowF2Modal] = useState(false);
  const [tempDate, setTempDate] = useState(date);

  // Bank / Cash Account (Debit)
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [bankHighlightIndex, setBankHighlightIndex] = useState(0);

  // Customer Ledger (Credit)
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState(0);

  // Amount & Narration
  const [voucherAmount, setVoucherAmount] = useState("0.00");
  const [narration, setNarration] = useState("");

  // Bill-wise details
  const [billWiseLines, setBillWiseLines] = useState<BillWiseLine[]>([]);
  const [showBillWiseModal, setShowBillWiseModal] = useState(false);

  // In-modal editing row state
  const [activeRefType, setActiveRefType] = useState<RefType>("AGST_REF");
  const [showRefTypeMenu, setShowRefTypeMenu] = useState(false);
  const [refTypeHighlightIndex, setRefTypeHighlightIndex] = useState(1); // default Agst Ref
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [showPendingBills, setShowPendingBills] = useState(false);
  const [pendingBillHighlightIndex, setPendingBillHighlightIndex] = useState(0);
  const [currentLineRefName, setCurrentLineRefName] = useState("");
  const [currentLineDueDate, setCurrentLineDueDate] = useState("");
  const [currentLineAmount, setCurrentLineAmount] = useState("");
  const [currentLineInvoiceId, setCurrentLineInvoiceId] = useState<string | undefined>();

  // Accept Confirmation Dialog
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [acceptFocusYes, setAcceptFocusYes] = useState(true);
  const [saving, setSaving] = useState(false);

  // DOM Refs for strict keyboard traversal & outside click
  const accountInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const narrationInputRef = useRef<HTMLTextAreaElement>(null);
  const refNameInputRef = useRef<HTMLInputElement>(null);
  const modalAmountInputRef = useRef<HTMLInputElement>(null);
  const refTypeCellRef = useRef<HTMLDivElement>(null);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Selected Bank & Customer details
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Load initial bank accounts & org info
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const storedOrg = localStorage.getItem("activeOrgName");
      if (storedOrg) setOrgName(storedOrg);
    } catch {}

    fetch("/api/v1/bank-accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.bankAccounts && Array.isArray(data.bankAccounts)) {
          setBankAccounts(data.bankAccounts);
          if (data.bankAccounts.length > 0 && !selectedBankId) {
            setSelectedBankId(data.bankAccounts[0].id);
          }
        }
      })
      .catch((err) => console.error("Failed to load bank accounts", err));

    fetch("/api/v1/contacts?type=customer&limit=2500&sortBy=name&sortOrder=asc", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = data.contacts || data.data || [];
        setCustomers((prev) => {
          const map = new Map<string, CustomerOption>();
          for (const c of prev) map.set(c.id, c);
          for (const c of list) {
            if (!map.has(c.id)) map.set(c.id, c);
          }
          return Array.from(map.values());
        });
      })
      .catch((err) => console.error("Failed to load customers", err));

    fetch("/api/v1/entries?type=RECEIPT&limit=1", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const count = (data.total || 0) + 1;
        setVoucherNo(String(count));
      })
      .catch(() => {});
  }, []);

  // Pre-fill from pending draft if navigated from other pages
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("pending_receipt_draft") || localStorage.getItem("pending_receipt_draft");
      if (stored) {
        sessionStorage.removeItem("pending_receipt_draft");
        localStorage.removeItem("pending_receipt_draft");
        const data = JSON.parse(stored);

        const targetId = data.contactId || data.customerId;
        const targetName = data.contactName || data.customerName;

        if (targetName) {
          setCustomerSearch(targetName);
        }
        if (targetId) {
          setSelectedCustomerId(targetId);
        }
        if (data.amount) {
          setVoucherAmount(String(data.amount));
        }
        if (data.notes || data.narration) {
          setNarration(data.notes || data.narration);
        }

        const orgId = localStorage.getItem("activeOrgId");
        const headers: Record<string, string> = {};
        if (orgId) headers["x-organization-id"] = orgId;

        const resolveCustomer = async () => {
          let found: CustomerOption | null = null;

          if (targetId) {
            try {
              const res = await fetch(`/api/v1/contacts/${targetId}`, { headers });
              if (res.ok) {
                const json = await res.json();
                const c = json.contact;
                if (c) {
                  found = {
                    id: c.id,
                    name: c.name,
                    phone: c.phone || "",
                    owesYou: c.openingBalance ? Math.round(parseFloat(c.openingBalance) * 100) : 0,
                  };
                }
              }
            } catch (e) {
              console.warn("Could not fetch contact by id", e);
            }
          }

          if (!found && targetName && targetName !== "Guest") {
            try {
              let res = await fetch(`/api/v1/contacts?search=${encodeURIComponent(targetName)}&limit=10`, { headers });
              let list: any[] = [];
              if (res.ok) {
                const json = await res.json();
                list = json.contacts || json.data || [];
              }
              if (list.length === 0 && targetName.includes("-")) {
                const prefix = targetName.split("-")[0].trim();
                if (prefix.length >= 2) {
                  res = await fetch(`/api/v1/contacts?search=${encodeURIComponent(prefix)}&limit=10`, { headers });
                  if (res.ok) {
                    const json = await res.json();
                    list = json.contacts || json.data || [];
                  }
                }
              }

              if (list.length > 0) {
                const best =
                  list.find(
                    (c: any) =>
                      c.name?.toLowerCase() === targetName.toLowerCase() ||
                      c.name?.toLowerCase().includes(targetName.toLowerCase()) ||
                      targetName.toLowerCase().includes(c.name?.toLowerCase())
                  ) || list[0];

                found = {
                  id: best.id,
                  name: best.name,
                  phone: best.phone || "",
                  owesYou: best.openingBalance ? Math.round(parseFloat(best.openingBalance) * 100) : 0,
                };
              }
            } catch (e) {
              console.warn("Could not search contact by name", e);
            }
          }

          if (found) {
            setSelectedCustomerId(found.id);
            setCustomerSearch(found.name);
            setCustomers((prev) => {
              const exists = prev.some((c) => c.id === found!.id);
              return exists ? prev.map((c) => (c.id === found!.id ? found! : c)) : [found!, ...prev];
            });
          }
        };

        resolveCustomer();
      }
    } catch (e) {
      console.error("Failed to load receipt draft", e);
    }
  }, []);

  // Debounced server search for customer ledger dropdown if typing names not yet loaded
  useEffect(() => {
    if (!customerSearch || customerSearch.trim().length < 2) return;
    const term = customerSearch.trim();

    const timer = setTimeout(async () => {
      const orgId = localStorage.getItem("activeOrgId");
      const headers: Record<string, string> = {};
      if (orgId) headers["x-organization-id"] = orgId;
      try {
        const res = await fetch(`/api/v1/contacts?search=${encodeURIComponent(term)}&type=customer&limit=30`, { headers });
        if (res.ok) {
          const data = await res.json();
          const list = data.contacts || data.data || [];
          if (list.length > 0) {
            setCustomers((prev) => {
              const map = new Map(prev.map((c) => [c.id, c]));
              for (const item of list) {
                if (!map.has(item.id)) {
                  map.set(item.id, {
                    id: item.id,
                    name: item.name,
                    phone: item.phone || "",
                    owesYou: item.openingBalance ? Math.round(parseFloat(item.openingBalance) * 100) : 0,
                  });
                }
              }
              return Array.from(map.values());
            });
          }
        }
      } catch (err) {
        // ignore search error
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Auto-focus Account input on initial mount
  useEffect(() => {
    setTimeout(() => {
      if (accountInputRef.current) {
        accountInputRef.current.focus();
        try { accountInputRef.current.select(); } catch {}
      }
    }, 150);
  }, []);

  // Fetch unpaid invoices when customer is selected
  useEffect(() => {
    if (!selectedCustomerId) {
      setInvoices([]);
      return;
    }
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/invoices?contactId=${selectedCustomerId}&limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || data.invoices || [];
        const unpaid: InvoiceOption[] = list
          .filter((inv: any) => ["sent", "partial", "overdue"].includes(inv.status) && inv.amountDue > 0)
          .map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            amountDue: inv.amountDue,
            total: inv.total,
            currencyCode: inv.currencyCode || "INR",
          }));
        setInvoices(unpaid);
      })
      .catch((err) => console.error("Failed to fetch invoices", err));
  }, [selectedCustomerId]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        bankDropdownRef.current &&
        !bankDropdownRef.current.contains(event.target as Node) &&
        accountInputRef.current &&
        !accountInputRef.current.contains(event.target as Node)
      ) {
        setShowBankDropdown(false);
      }
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node) &&
        customerInputRef.current &&
        !customerInputRef.current.contains(event.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-scroll highlighted dropdown items into view
  useEffect(() => {
    if (showBankDropdown) {
      document.getElementById(`bank-opt-${bankHighlightIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [bankHighlightIndex, showBankDropdown]);

  useEffect(() => {
    if (showCustomerDropdown) {
      document.getElementById(`cust-opt-${customerHighlightIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [customerHighlightIndex, showCustomerDropdown]);

  useEffect(() => {
    if (showPendingBills) {
      document.getElementById(`bill-opt-${pendingBillHighlightIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [pendingBillHighlightIndex, showPendingBills]);

  useEffect(() => {
    if (showRefTypeMenu) {
      document.getElementById(`reftype-opt-${refTypeHighlightIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [refTypeHighlightIndex, showRefTypeMenu]);

  // Global Keyboard Shortcuts (F2 Date, Ctrl+A Save, Escape, Modal Arrow & Enter navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Accept Dialog Keyboard Navigation
      if (showAcceptDialog) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
          e.preventDefault();
          setAcceptFocusYes((prev) => !prev);
          return;
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          handlePostVoucher();
          return;
        }
        if (e.key === "n" || e.key === "N" || e.key === "Escape") {
          e.preventDefault();
          setShowAcceptDialog(false);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (acceptFocusYes) {
            handlePostVoucher();
          } else {
            setShowAcceptDialog(false);
          }
          return;
        }
        return;
      }

      // 2. Bill-wise Details Modal Popups Navigation (Method of Adj & Pending Bills)
      if (showBillWiseModal) {
        if (showRefTypeMenu) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setRefTypeHighlightIndex((prev) => (prev + 1) % REF_TYPE_OPTIONS.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setRefTypeHighlightIndex((prev) => (prev - 1 + REF_TYPE_OPTIONS.length) % REF_TYPE_OPTIONS.length);
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const selected = REF_TYPE_OPTIONS[refTypeHighlightIndex];
            if (selected) {
              handleSelectRefType(selected.type);
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setShowRefTypeMenu(false);
            setTimeout(() => refTypeCellRef.current?.focus(), 20);
            return;
          }
        }

        if (showPendingBills) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setPendingBillHighlightIndex((prev) => Math.min(prev + 1, invoices.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setPendingBillHighlightIndex((prev) => Math.max(prev - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (invoices[pendingBillHighlightIndex]) {
              handleSelectPendingBill(invoices[pendingBillHighlightIndex]);
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setShowPendingBills(false);
            return;
          }
        }
      }

      // 3. Global hotkeys
      if (e.key === "F2") {
        e.preventDefault();
        setTempDate(date);
        setShowF2Modal(true);
      } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (validateBeforeAccept()) {
          setShowAcceptDialog(true);
        }
      } else if (e.key === "Escape") {
        if (showPendingBills) {
          e.preventDefault();
          setShowPendingBills(false);
        } else if (showRefTypeMenu) {
          e.preventDefault();
          setShowRefTypeMenu(false);
        } else if (showBillWiseModal) {
          e.preventDefault();
          setShowBillWiseModal(false);
          amountInputRef.current?.focus();
        } else if (showAcceptDialog) {
          e.preventDefault();
          setShowAcceptDialog(false);
        } else if (showF2Modal) {
          e.preventDefault();
          setShowF2Modal(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    date,
    showPendingBills,
    showRefTypeMenu,
    showBillWiseModal,
    showAcceptDialog,
    showF2Modal,
    voucherAmount,
    selectedCustomerId,
    refTypeHighlightIndex,
    pendingBillHighlightIndex,
    acceptFocusYes,
    invoices
  ]);

  const validateBeforeAccept = () => {
    if (!selectedBankId) {
      toast.error("Please select an Account (Cash/Bank)");
      accountInputRef.current?.focus();
      return false;
    }
    if (!selectedCustomerId) {
      toast.error("Please select a Customer Ledger in Particulars");
      customerInputRef.current?.focus();
      return false;
    }
    const num = parseFloat(voucherAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("Please enter a valid receipt amount");
      amountInputRef.current?.focus();
      return false;
    }
    return true;
  };

  // Open Bill-wise details modal
  const openBillWiseDetails = () => {
    const num = parseFloat(voucherAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("Please enter receipt amount first");
      amountInputRef.current?.focus();
      return;
    }
    if (!selectedCustomerId) {
      toast.error("Please select a customer first");
      customerInputRef.current?.focus();
      return;
    }

    const defaultRef: RefType = invoices.length > 0 ? "AGST_REF" : "NEW_REF";
    setActiveRefType(defaultRef);
    setRefTypeHighlightIndex(defaultRef === "AGST_REF" ? 1 : 2);
    setCurrentLineAmount(voucherAmount);
    setCurrentLineRefName(defaultRef === "NEW_REF" ? `ADV-${voucherNo}` : "");
    setCurrentLineDueDate(date);
    setCurrentLineInvoiceId(undefined);
    setShowBillWiseModal(true);
    setShowRefTypeMenu(true);
    setTimeout(() => refTypeCellRef.current?.focus(), 30);
  };

  // Handle selecting Ref Type from Method of Adj popup
  const handleSelectRefType = (refType: RefType) => {
    setActiveRefType(refType);
    setShowRefTypeMenu(false);

    if (refType === "AGST_REF") {
      if (invoices.length > 0) {
        setShowPendingBills(true);
        setPendingBillHighlightIndex(0);
      } else {
        toast.info("No pending invoices found for this customer. Use Advance or New Ref.");
        setActiveRefType("NEW_REF");
        setCurrentLineRefName(`ADV-${voucherNo}`);
        setTimeout(() => refNameInputRef.current?.focus(), 50);
      }
    } else if (refType === "NEW_REF" || refType === "ADVANCE") {
      setCurrentLineRefName(`ADV-${voucherNo}`);
      setTimeout(() => refNameInputRef.current?.focus(), 50);
    } else if (refType === "ON_ACCOUNT") {
      setCurrentLineRefName("On Account");
      setTimeout(() => modalAmountInputRef.current?.focus(), 50);
    }
  };

  // Handle selecting a Pending Bill
  const handleSelectPendingBill = (inv: InvoiceOption) => {
    setCurrentLineInvoiceId(inv.id);
    setCurrentLineRefName(inv.invoiceNumber);
    setCurrentLineDueDate(inv.dueDate || inv.issueDate || date);
    const invoiceDueRupees = (inv.amountDue / 100).toFixed(2);
    const voucherRupees = parseFloat(voucherAmount);
    const allocated = Math.min(parseFloat(invoiceDueRupees), voucherRupees).toFixed(2);
    setCurrentLineAmount(allocated);
    setShowPendingBills(false);
    setTimeout(() => {
      modalAmountInputRef.current?.focus();
      modalAmountInputRef.current?.select();
    }, 50);
  };

  // Commit Bill-wise Line & Close Modal
  const handleConfirmBillWiseLine = () => {
    const numAmt = parseFloat(currentLineAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      toast.error("Invalid amount");
      return;
    }

    const newLine: BillWiseLine = {
      id: Math.random().toString(36).substring(2, 9),
      refType: activeRefType,
      refName: currentLineRefName || (activeRefType === "ON_ACCOUNT" ? "On Account" : `REF-${voucherNo}`),
      dueDate: currentLineDueDate || date,
      amount: numAmt,
      invoiceId: currentLineInvoiceId,
      drCr: "Cr",
    };

    setBillWiseLines([newLine]);
    setShowBillWiseModal(false);
    toast.success("Bill-wise adjustment added");

    setTimeout(() => {
      narrationInputRef.current?.focus();
    }, 100);
  };

  // Final Submit
  const handlePostVoucher = async () => {
    if (!validateBeforeAccept()) return;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const totalCents = Math.round(parseFloat(voucherAmount) * 100);
    const line = billWiseLines[0] || {
      refType: invoices.length > 0 ? "AGST_REF" : "ON_ACCOUNT",
      refName: invoices.length > 0 ? invoices[0].invoiceNumber : "On Account",
      invoiceId: invoices.length > 0 ? invoices[0].id : undefined,
      amount: parseFloat(voucherAmount),
    };

    setSaving(true);
    setShowAcceptDialog(false);

    try {
      if (line.refType === "AGST_REF" && line.invoiceId) {
        const payRes = await fetch(`/api/v1/invoices/${line.invoiceId}/pay`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            amount: totalCents,
            date,
            method: "bank_transfer",
            bankAccountId: selectedBankId,
            reference: line.refName,
          }),
        });

        if (!payRes.ok) {
          const errData = await payRes.json();
          throw new Error(errData.error || "Failed to settle invoice");
        }
      } else {
        const credRes = await fetch("/api/v1/customer-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            contactId: selectedCustomerId,
            date,
            amount: totalCents,
            sourceType: "prepayment",
            bankAccountId: selectedBankId,
            notes: narration || `Receipt Voucher ${voucherNo}`,
            adjustmentType: line.refType === "ON_ACCOUNT" ? "ON_ACCOUNT" : "NEW_REF",
            referenceName: line.refType === "ON_ACCOUNT" ? null : line.refName,
          }),
        });

        if (!credRes.ok) {
          const errData = await credRes.json();
          throw new Error(errData.error || "Failed to record customer credit");
        }
      }

      toast.success(`Receipt Voucher No. ${voucherNo} posted successfully! ✓`);
      router.push("/accounting/sales/customer-prepayments");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to post Receipt Voucher");
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch))
  );

  const { dateDisplay, dayDisplay } = formatTallyDate(date);

  return (
    <div className="w-full min-h-[calc(100vh-5rem)] flex flex-col bg-[#e8edf2] text-slate-900 font-sans p-2 sm:p-4 select-none">
      {/* Full-Page Tally Terminal Container */}
      <div className="w-full flex-1 flex flex-col bg-white border-2 border-slate-700 shadow-2xl rounded-sm overflow-visible">
        {/* Top Tally Header Bar */}
        <div className="bg-[#244b7a] text-white px-5 py-2 flex items-center justify-between text-xs font-bold tracking-wide border-b border-slate-600">
          <div className="flex items-center gap-3">
            <span className="bg-[#183253] px-2 py-0.5 rounded text-amber-300 font-mono text-xs">F6</span>
            <span className="text-sm font-extrabold tracking-tight">Accounting Voucher Creation</span>
          </div>
          <div className="font-bold text-slate-100 text-sm tracking-wide">{orgName}</div>
        </div>

        {/* Voucher Meta Subheader */}
        <div className="bg-[#e8f0f8] border-b border-slate-300 px-6 py-2.5 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="font-extrabold text-[#1a3a60] text-lg tracking-tight">Receipt</div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-bold">No.</span>
              <span className="font-mono font-black text-slate-900 bg-white px-2.5 py-0.5 border border-slate-400 rounded text-sm shadow-xs">
                {voucherNo}
              </span>
            </div>
          </div>
          <div
            onClick={() => {
              setTempDate(date);
              setShowF2Modal(true);
            }}
            className="flex items-center gap-2 cursor-pointer hover:bg-white/90 px-3 py-1 rounded border border-transparent hover:border-slate-300 transition-all"
            title="Press F2 to change Date"
          >
            <span className="font-extrabold text-slate-900 text-sm">{dateDisplay}</span>
            <span className="text-slate-600 text-xs font-semibold">{dayDisplay}</span>
            <span className="text-[10px] font-mono bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-black border border-blue-200">
              F2
            </span>
          </div>
        </div>

        {/* Single-Entry Form Body */}
        <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Account (Bank/Cash) Field */}
            <div className="relative flex flex-col sm:flex-row sm:items-start gap-3 border-b border-slate-200 pb-4">
              <div className="w-32 shrink-0 text-sm font-black text-slate-800 pt-1 flex items-center justify-between">
                <span>Account</span>
                <span>:</span>
              </div>
              <div className="flex-1 max-w-xl relative">
                <input
                  ref={accountInputRef}
                  type="text"
                  readOnly
                  value={selectedBank ? selectedBank.accountName : "Select Bank / Cash Account"}
                  onClick={() => setShowBankDropdown(true)}
                  onFocus={() => setShowBankDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setShowBankDropdown(true);
                      setBankHighlightIndex((prev) => Math.min(prev + 1, bankAccounts.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setShowBankDropdown(true);
                      setBankHighlightIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (showBankDropdown && bankAccounts[bankHighlightIndex]) {
                        setSelectedBankId(bankAccounts[bankHighlightIndex].id);
                        setShowBankDropdown(false);
                        customerInputRef.current?.focus();
                      } else {
                        setShowBankDropdown(true);
                      }
                    } else if (e.key === "Tab" || e.key === "Escape") {
                      setShowBankDropdown(false);
                    }
                  }}
                  className="w-full bg-[#f8fafc] border-2 border-slate-400 font-black text-slate-900 px-3.5 py-2 text-sm rounded shadow-inner focus:bg-amber-50 focus:border-blue-600 focus:outline-none cursor-pointer"
                />

                {/* Current Balance under Account */}
                {selectedBank && (
                  <div className="mt-1.5 text-xs text-slate-600 font-medium flex items-center gap-2">
                    <span className="text-slate-500 italic">Current balance :</span>
                    <span className="font-mono font-bold text-slate-800">
                      ₹ {((selectedBank.balance || 5000000) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                      Dr
                    </span>
                  </div>
                )}

                {/* Bank Accounts Dropdown */}
                {showBankDropdown && (
                  <div ref={bankDropdownRef} className="absolute left-0 top-full mt-1 w-full bg-white border-2 border-blue-600 shadow-2xl z-50 rounded overflow-hidden">
                    <div className="bg-[#244b7a] text-white text-xs font-bold px-3.5 py-1.5 flex justify-between">
                      <span>List of Ledger Accounts</span>
                      <span className="text-amber-300 font-mono text-[10px]">↑↓ Navigate · Enter Select</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {bankAccounts.map((b, idx) => (
                        <div
                          key={b.id}
                          id={`bank-opt-${idx}`}
                          onClick={() => {
                            setSelectedBankId(b.id);
                            setShowBankDropdown(false);
                            customerInputRef.current?.focus();
                          }}
                          onMouseEnter={() => setBankHighlightIndex(idx)}
                          className={`px-3.5 py-2.5 text-xs flex justify-between items-center cursor-pointer ${
                            idx === bankHighlightIndex ? "bg-amber-100 font-bold text-blue-900" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-bold text-slate-900">{b.accountName}</span>
                          <span className="font-mono font-bold text-slate-700">
                            ₹ {((b.balance || 5000000) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} Dr
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Voucher Table (Particulars & Amount) */}
            <div className="border-2 border-slate-300 rounded overflow-visible">
              {/* Table Header */}
              <div className="bg-[#f1f5f9] border-b-2 border-slate-300 px-4 py-2 flex justify-between text-xs font-black uppercase text-slate-700 tracking-wider">
                <span className="w-2/3">Particulars</span>
                <span className="w-1/3 text-right">Amount (₹)</span>
              </div>

              {/* Row 1: Customer Ledger */}
              <div className="p-4 bg-white space-y-3">
                <div className="flex items-start justify-between gap-6">
                  {/* Particulars (Customer Search) */}
                  <div className="w-2/3 relative">
                    <input
                      ref={customerInputRef}
                      type="text"
                      placeholder="Type or select customer ledger..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => {
                        setShowCustomerDropdown(true);
                        try { customerInputRef.current?.select(); } catch {}
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setCustomerHighlightIndex((prev) => Math.min(prev + 1, filteredCustomers.length - 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setCustomerHighlightIndex((prev) => Math.max(prev - 1, 0));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (showCustomerDropdown && filteredCustomers[customerHighlightIndex]) {
                            const c = filteredCustomers[customerHighlightIndex];
                            setSelectedCustomerId(c.id);
                            setCustomerSearch(c.name);
                            setShowCustomerDropdown(false);
                            amountInputRef.current?.focus();
                            amountInputRef.current?.select();
                          } else {
                            amountInputRef.current?.focus();
                          }
                        } else if (e.key === "Escape") {
                          setShowCustomerDropdown(false);
                        }
                      }}
                      className="w-full bg-[#f8fafc] border-2 border-slate-400 font-black text-slate-900 px-3.5 py-2 text-sm rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
                    />

                    {/* Customer Current Balance */}
                    {selectedCustomer && (
                      <div className="mt-1.5 text-xs text-slate-600 font-medium flex items-center gap-2">
                        <span className="text-slate-500 italic">Cur Bal :</span>
                        <span className="font-mono font-bold text-slate-800">
                          ₹{" "}
                          {(Math.abs(selectedCustomer.owesYou || 40000) / 100).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          {(selectedCustomer.owesYou || 40000) >= 0 ? "Dr" : "Cr"}
                        </span>
                      </div>
                    )}

                    {/* Customer Dropdown */}
                    {showCustomerDropdown && (
                      <div ref={customerDropdownRef} className="absolute left-0 top-full mt-1 w-full bg-white border-2 border-blue-600 shadow-2xl z-50 rounded overflow-hidden">
                        <div className="bg-[#244b7a] text-white text-xs font-bold px-3.5 py-1.5 flex justify-between">
                          <span>List of Customer Ledgers</span>
                          <span className="text-amber-300 font-mono text-[10px]">↑↓ Navigate · Enter Select</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {filteredCustomers.length === 0 ? (
                            <div className="p-4 text-xs text-slate-500 text-center">No matching customers found</div>
                          ) : (
                            filteredCustomers.map((c, idx) => (
                              <div
                                key={c.id}
                                id={`cust-opt-${idx}`}
                                onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerSearch(c.name);
                                  setShowCustomerDropdown(false);
                                  amountInputRef.current?.focus();
                                  amountInputRef.current?.select();
                                }}
                                onMouseEnter={() => setCustomerHighlightIndex(idx)}
                                className={`px-3.5 py-2.5 text-xs flex justify-between items-center cursor-pointer ${
                                  idx === customerHighlightIndex
                                    ? "bg-amber-100 font-bold text-blue-900"
                                    : "hover:bg-slate-50"
                                }`}
                              >
                                <span className="font-bold text-slate-900">{c.name}</span>
                                <span className="font-mono font-bold text-slate-700">
                                  ₹{" "}
                                  {(Math.abs(c.owesYou || 40000) / 100).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}{" "}
                                  {(c.owesYou || 40000) >= 0 ? "Dr" : "Cr"}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Amount Column */}
                  <div className="w-1/3 flex items-center justify-end gap-2">
                    <input
                      ref={amountInputRef}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={voucherAmount}
                      onChange={(e) => setVoucherAmount(e.target.value)}
                      onFocus={() => {
                        try { amountInputRef.current?.select(); } catch {}
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          openBillWiseDetails();
                        } else if (e.key === "Backspace" && (!voucherAmount || voucherAmount === "0.00")) {
                          customerInputRef.current?.focus();
                        }
                      }}
                      className="w-full max-w-[200px] text-right bg-[#f8fafc] border-2 border-slate-400 font-mono font-black text-slate-900 px-3.5 py-2 text-base rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
                    />
                    <span className="font-bold text-xs text-slate-700">Cr</span>
                  </div>
                </div>

                {/* Rendered Bill-wise Sub-lines under Customer (Matching Tally Screenshot 4 & 5) */}
                {billWiseLines.length > 0 && (
                  <div className="pl-6 pt-2 space-y-1.5">
                    {billWiseLines.map((line) => (
                      <div
                        key={line.id}
                        onClick={openBillWiseDetails}
                        className="flex items-center justify-between text-xs font-mono text-slate-800 bg-blue-50/80 border border-blue-200 px-3.5 py-1.5 rounded cursor-pointer hover:bg-blue-100 transition-colors"
                        title="Click or press Enter on amount to edit bill-wise details"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-extrabold text-blue-900">
                            {line.refType === "AGST_REF"
                              ? "Agst Ref"
                              : line.refType === "NEW_REF"
                              ? "New Ref"
                              : line.refType === "ADVANCE"
                              ? "Advance"
                              : "On Account"}
                          </span>
                          <span className="text-slate-900 font-bold">{line.refName}</span>
                          {line.dueDate && <span className="text-slate-500 font-sans font-medium">({line.dueDate})</span>}
                        </div>
                        <div className="font-black text-slate-900 text-sm">
                          {line.amount.toFixed(2)} {line.drCr}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Table Total Footer */}
              <div className="bg-[#f8fafc] border-t-2 border-slate-300 px-6 py-2.5 flex justify-between items-center text-sm font-black">
                <span className="text-slate-600 uppercase tracking-wide">Total</span>
                <span className="font-mono text-slate-900 text-lg">
                  ₹ {parseFloat(voucherAmount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Narration Section */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 pt-2">
              <div className="w-32 shrink-0 text-sm font-black text-slate-800 pt-1 flex items-center justify-between">
                <span>Narration</span>
                <span>:</span>
              </div>
              <div className="flex-1 max-w-2xl">
                <textarea
                  ref={narrationInputRef}
                  rows={2}
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (validateBeforeAccept()) {
                        setShowAcceptDialog(true);
                      }
                    } else if (e.key === "Backspace" && !narration) {
                      amountInputRef.current?.focus();
                    }
                  }}
                  placeholder="Enter narration or press Enter to Accept..."
                  className="w-full bg-[#f8fafc] border-2 border-slate-400 text-slate-900 px-3.5 py-2 text-sm rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Hint Bar */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="bg-slate-200 px-2 py-0.5 rounded font-black font-mono">F2</kbd> Date
              </span>
              <span>
                <kbd className="bg-slate-200 px-2 py-0.5 rounded font-black font-mono">Ctrl+A</kbd> Accept
              </span>
              <span>
                <kbd className="bg-slate-200 px-2 py-0.5 rounded font-black font-mono">Esc</kbd> Cancel
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (validateBeforeAccept()) setShowAcceptDialog(true);
              }}
              className="bg-[#244b7a] hover:bg-[#1b385c] text-white font-extrabold px-6 py-2.5 rounded text-xs shadow-md transition-all flex items-center gap-2"
            >
              <span>Accept (Save)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. BILL-WISE DETAILS MODAL (Matching Screenshot 1, 2, 3) */}
      {/* ========================================================================= */}
      {showBillWiseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-slate-800 shadow-2xl rounded-sm w-full max-w-3xl overflow-visible animate-in fade-in zoom-in-95 duration-100 relative">
            {/* Modal Header */}
            <div className="bg-[#244b7a] text-white px-5 py-2.5 flex items-center justify-between text-xs font-extrabold tracking-wide">
              <span>Bill-wise Details for : {selectedCustomer?.name || "Customer"}</span>
              <span className="font-mono text-amber-300">Up to: ₹ {parseFloat(voucherAmount || "0").toFixed(2)} Cr</span>
            </div>

            {/* Modal Table Body */}
            <div className="p-5 space-y-5 overflow-visible">
              <table className="w-full text-xs text-left border-2 border-slate-400 overflow-visible">
                <thead className="bg-[#e8f0f8] text-slate-900 border-b-2 border-slate-400 font-extrabold uppercase">
                  <tr>
                    <th className="px-3.5 py-2 border-r-2 border-slate-400 w-36">Type of Ref</th>
                    <th className="px-3.5 py-2 border-r-2 border-slate-400 w-44">Name</th>
                    <th className="px-3.5 py-2 border-r-2 border-slate-400 w-36">Due Date, or credit Days</th>
                    <th className="px-3.5 py-2 border-r-2 border-slate-400 text-right w-32">Amount</th>
                    <th className="px-3.5 py-2 text-center w-16">Dr/Cr</th>
                  </tr>
                </thead>
                <tbody className="overflow-visible">
                  <tr className="bg-amber-50/50 border-b border-slate-300 overflow-visible">
                    {/* Type of Ref Cell */}
                    <td className="px-3.5 py-2 border-r-2 border-slate-400 font-black text-blue-900 relative overflow-visible">
                      <div
                        ref={refTypeCellRef}
                        tabIndex={0}
                        onClick={() => { setShowRefTypeMenu(true); setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex(o => o.type === activeRefType)); }}
                        onFocus={() => { setShowRefTypeMenu(true); setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex(o => o.type === activeRefType)); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                            e.preventDefault();
                            setShowRefTypeMenu(true);
                            setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex(o => o.type === activeRefType));
                          } else if (e.key === "Escape") {
                            setShowRefTypeMenu(false);
                          }
                        }}
                        className="cursor-pointer hover:underline flex items-center justify-between py-1 gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-amber-50 rounded px-1"
                      >
                        <span>
                          {activeRefType === "AGST_REF"
                            ? "Agst Ref"
                            : activeRefType === "NEW_REF"
                            ? "New Ref"
                            : activeRefType === "ADVANCE"
                            ? "Advance"
                            : "On Account"}
                        </span>
                        <span className="text-blue-400 text-[10px]">▾</span>
                      </div>

                      {/* Method of Adj. Floating Popup (Screenshot 1) */}
                      {showRefTypeMenu && (
                        <div className="absolute left-0 top-full mt-1.5 w-48 bg-white border-2 border-blue-600 shadow-2xl z-[100] rounded overflow-hidden">
                          <div className="bg-[#244b7a] text-white font-extrabold px-3.5 py-1.5 text-xs flex justify-between items-center">
                            <span>Method of Adj.</span>
                            <span className="text-amber-300 font-mono text-[10px] font-normal">↑↓ · Enter</span>
                          </div>
                          <div className="divide-y divide-slate-100 text-xs font-semibold">
                            {REF_TYPE_OPTIONS.map((opt, idx) => (
                              <div
                                key={opt.type}
                                id={`reftype-opt-${idx}`}
                                onClick={() => handleSelectRefType(opt.type as RefType)}
                                onMouseEnter={() => setRefTypeHighlightIndex(idx)}
                                className={`px-3.5 py-2.5 cursor-pointer ${
                                  idx === refTypeHighlightIndex
                                    ? "bg-amber-100 font-black text-blue-900"
                                    : "hover:bg-slate-50 text-slate-800"
                                }`}
                              >
                                {opt.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Reference Name Cell */}
                    <td className="px-3.5 py-2 border-r-2 border-slate-400">
                      <input
                        ref={refNameInputRef}
                        type="text"
                        value={currentLineRefName}
                        onChange={(e) => setCurrentLineRefName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            modalAmountInputRef.current?.focus();
                            modalAmountInputRef.current?.select();
                          }
                        }}
                        disabled={activeRefType === "ON_ACCOUNT"}
                        placeholder={activeRefType === "ON_ACCOUNT" ? "On Account" : "Ref Name..."}
                        className="w-full bg-white border border-slate-400 px-2.5 py-1 text-xs font-black rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
                      />
                    </td>

                    {/* Due Date Cell */}
                    <td className="px-3.5 py-2 border-r-2 border-slate-400 font-mono font-bold text-slate-800">
                      {currentLineDueDate || date}
                    </td>

                    {/* Amount Cell */}
                    <td className="px-3.5 py-2 border-r-2 border-slate-400 text-right">
                      <input
                        ref={modalAmountInputRef}
                        type="number"
                        step="0.01"
                        value={currentLineAmount}
                        onChange={(e) => setCurrentLineAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleConfirmBillWiseLine();
                          }
                        }}
                        className="w-28 text-right bg-white border border-slate-400 px-2.5 py-1 text-xs font-mono font-black rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
                      />
                    </td>

                    {/* Dr/Cr Cell */}
                    <td className="px-3.5 py-2 text-center font-black text-slate-800">Cr</td>
                  </tr>
                </tbody>
              </table>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBillWiseModal(false)}
                  className="px-5 py-2 border-2 border-slate-400 rounded text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBillWiseLine}
                  className="px-6 py-2 bg-[#244b7a] hover:bg-[#1b385c] text-white rounded text-xs font-extrabold shadow transition-colors"
                >
                  Confirm (Enter)
                </button>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 2. PENDING BILLS POPUP (Matching Screenshot 2) */}
            {/* ========================================================================= */}
            {showPendingBills && (
              <div className="absolute top-12 right-2 w-[420px] bg-white border-2 border-blue-600 shadow-2xl z-[100] rounded overflow-hidden">
                <div className="bg-[#244b7a] text-white px-4 py-2 text-xs font-black flex justify-between items-center">
                  <span>Pending Bills</span>
                  <span className="text-[10px] text-amber-300 font-mono">↑↓ to navigate, Enter to pick</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-800 border-b border-slate-300 font-extrabold uppercase">
                      <tr>
                        <th className="px-3 py-1.5">Name</th>
                        <th className="px-3 py-1.5">Date</th>
                        <th className="px-3 py-1.5 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500 font-medium">
                            No pending bills found
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv, idx) => (
                          <tr
                            key={inv.id}
                            id={`bill-opt-${idx}`}
                            onClick={() => handleSelectPendingBill(inv)}
                            onMouseEnter={() => setPendingBillHighlightIndex(idx)}
                            className={`cursor-pointer ${
                              idx === pendingBillHighlightIndex
                                ? "bg-amber-100 font-black text-blue-900"
                                : "hover:bg-slate-50 text-slate-800 font-medium"
                            }`}
                          >
                            <td className="px-3 py-2 font-black">{inv.invoiceNumber}</td>
                            <td className="px-3 py-2 text-slate-600 font-mono">{inv.issueDate || "-"}</td>
                            <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">
                              ₹ {(inv.amountDue / 100).toFixed(2)} Dr
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ACCEPT? YES OR NO CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      {showAcceptDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-slate-800 shadow-2xl rounded p-6 w-84 text-center space-y-5 animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-lg font-black text-slate-900">Accept?</h3>
            <p className="text-xs text-slate-600 font-semibold">
              Post Receipt Voucher No. {voucherNo} for ₹{" "}
              {parseFloat(voucherAmount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}?
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                autoFocus={acceptFocusYes}
                onClick={handlePostVoucher}
                disabled={saving}
                className={`px-6 py-2.5 font-black text-xs rounded shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                  acceptFocusYes
                    ? "bg-[#244b7a] text-white ring-2 ring-blue-600 scale-[1.03]"
                    : "bg-[#244b7a] text-white hover:bg-[#1b385c]"
                }`}
              >
                {saving ? "Posting..." : "Yes"}
                <span className="ml-1.5 text-[10px] font-mono opacity-70">(Y / ↵)</span>
              </button>
              <button
                type="button"
                autoFocus={!acceptFocusYes}
                onClick={() => setShowAcceptDialog(false)}
                className={`px-6 py-2.5 font-bold text-xs rounded transition-all focus:outline-none focus:ring-2 focus:ring-slate-600 ${
                  !acceptFocusYes
                    ? "border-2 border-slate-600 bg-slate-100 text-slate-900 ring-2 ring-slate-600 scale-[1.03]"
                    : "border-2 border-slate-400 hover:bg-slate-100 text-slate-800"
                }`}
              >
                No
                <span className="ml-1.5 text-[10px] font-mono opacity-70">(N / Esc)</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">← → or Tab to switch · Enter to confirm</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. F2 VOUCHER DATE CHANGE MODAL */}
      {/* ========================================================================= */}
      {showF2Modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-slate-800 shadow-2xl rounded p-5 w-84 space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="bg-[#244b7a] text-white px-4 py-2 font-black text-xs rounded -mx-5 -mt-5 flex justify-between">
              <span>Change Voucher Date</span>
              <span className="font-mono text-amber-300">F2</span>
            </div>
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-black text-slate-800">Voucher Date</label>
              <input
                type="date"
                autoFocus
                value={tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setDate(tempDate);
                    setShowF2Modal(false);
                  } else if (e.key === "Escape") {
                    setShowF2Modal(false);
                  }
                }}
                className="w-full bg-[#f8fafc] border-2 border-slate-400 font-black text-slate-900 px-3.5 py-2 text-sm rounded focus:bg-amber-50 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowF2Modal(false)}
                className="px-4 py-1.5 border border-slate-300 text-xs rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDate(tempDate);
                  setShowF2Modal(false);
                }}
                className="px-5 py-1.5 bg-[#244b7a] text-white text-xs font-black rounded shadow"
              >
                Apply (Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
