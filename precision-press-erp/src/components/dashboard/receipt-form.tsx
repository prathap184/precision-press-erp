"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X } from "lucide-react";
import { fuzzyMatch } from "@/lib/search-utils";

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
  const [voucherAmount, setVoucherAmount] = useState("");
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
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const modalAmountInputRef = useRef<HTMLInputElement>(null);
  const refTypeCellRef = useRef<HTMLDivElement>(null);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementIdRef = useRef<string | null>(null);

  // Keep track of the last focused input/select/button on the page
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.id) {
        if (!target.closest('[role="dialog"]') && !target.id.startsWith("modal-")) {
          lastFocusedElementIdRef.current = target.id;
        }
      }
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

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

    fetch("/api/v1/customer-credits?limit=500", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || data.credits || [];
        let maxRef = 0;
        list.forEach((c: any) => {
          const refStr = c.journalEntry?.reference || c.notes || "";
          const match = refStr.match(/REF-?(\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxRef) maxRef = num;
          }
        });
        const nextNo = Math.max(maxRef + 1, list.length + 1, 1);
        setVoucherNo(String(nextNo));
      })
      .catch(() => {});
  }, []);

  // Autofocus Account input on initial page load
  useEffect(() => {
    const timer = setTimeout(() => {
      accountInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Pre-fill from URL params or pending draft if navigated from other pages
  useEffect(() => {
    try {
      let targetId = "";
      let targetName = "";
      let targetAmount = "";
      let targetNotes = "";

      if (typeof window !== "undefined") {
        const searchParams = new URLSearchParams(window.location.search);
        targetId = searchParams.get("customerId") || searchParams.get("contactId") || "";
        targetName = searchParams.get("customerName") || searchParams.get("contactName") || "";
        targetAmount = searchParams.get("amount") || "";
        targetNotes = searchParams.get("notes") || searchParams.get("narration") || "";
      }

      if (!targetId && !targetName && !targetAmount) {
        const stored = sessionStorage.getItem("pending_receipt_draft") || localStorage.getItem("pending_receipt_draft");
        if (stored) {
          sessionStorage.removeItem("pending_receipt_draft");
          localStorage.removeItem("pending_receipt_draft");
          const data = JSON.parse(stored);
          targetId = data.contactId || data.customerId || "";
          targetName = data.contactName || data.customerName || "";
          targetAmount = data.amount ? String(data.amount) : "";
          targetNotes = data.notes || data.narration || "";
        }
      }

      if (targetName) {
        setCustomerSearch(targetName);
      }
      if (targetId) {
        setSelectedCustomerId(targetId);
      }
      if (targetAmount) {
        setVoucherAmount(targetAmount);
      }
      if (targetNotes) {
        setNarration(targetNotes);
      }

      if (targetId || targetName) {
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
          .filter((inv: any) => inv.status !== "paid" && inv.status !== "void" && inv.status !== "cancelled" && inv.amountDue > 0)
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
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            if (invoices[pendingBillHighlightIndex]) {
              handleSelectPendingBill(invoices[pendingBillHighlightIndex]);
            }
            return;
          }
          if (e.key === "Escape" || e.key === "Backspace") {
            e.preventDefault();
            setShowPendingBills(false);
            setShowRefTypeMenu(true);
            setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex((o) => o.type === "AGST_REF"));
            setTimeout(() => refTypeCellRef.current?.focus(), 20);
            return;
          }
          return;
        }

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
            if (document.activeElement === customerInputRef.current) {
              return;
            }
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
          if (e.key === "Backspace") {
            e.preventDefault();
            setShowRefTypeMenu(false);
            setShowBillWiseModal(false);
            customerInputRef.current?.focus();
            try {
              customerInputRef.current?.select();
            } catch {}
            return;
          }
          return;
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
        return;
      }

      // Smart Focus Recovery: If user clicks outside and focus lands on body / background,
      // pressing Enter, Backspace, Arrow keys, or typing instantly restores focus to their last active box!
      const activeEl = document.activeElement;
      const isBodyOrBg =
        !activeEl ||
        activeEl === document.body ||
        activeEl.tagName === "BODY" ||
        activeEl.tagName === "HTML" ||
        activeEl.id === "__next" ||
        (activeEl.tagName === "DIV" && !activeEl.getAttribute("tabindex"));

      if (isBodyOrBg && !showBillWiseModal && !showAcceptDialog && !showF2Modal) {
        if (["Control", "Alt", "Shift", "Meta", "F12", "F5"].includes(e.key)) return;

        const targetId = lastFocusedElementIdRef.current;
        let targetEl = targetId ? document.getElementById(targetId) : null;

        if (!targetEl) {
          if (!selectedCustomerId) {
            targetEl = document.getElementById("receipt-customer-input");
          } else if (!voucherAmount) {
            targetEl = document.getElementById("receipt-amount-input");
          } else {
            targetEl = document.getElementById("receipt-customer-input");
          }
        }

        if (targetEl) {
          targetEl.focus();
          if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
            try {
              const len = targetEl.value ? targetEl.value.length : 0;
              targetEl.setSelectionRange(len, len);
            } catch {}
          }
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
      toast.error("Please enter a valid receipt amount in Bill-wise details");
      openBillWiseDetails();
      return false;
    }
    return true;
  };

  // Open Bill-wise details modal (Amount is entered/picked in this small window!)
  const openBillWiseDetails = (forcedCustomer?: CustomerOption) => {
    const custId = forcedCustomer?.id || selectedCustomerId;
    if (!custId) {
      toast.error("Please select a customer first");
      customerInputRef.current?.focus();
      return;
    }

    if (billWiseLines.length > 0) {
      const prevLine = billWiseLines[0];
      setActiveRefType(prevLine.refType);
      const prevIdx = REF_TYPE_OPTIONS.findIndex((o) => o.type === prevLine.refType);
      setRefTypeHighlightIndex(prevIdx >= 0 ? prevIdx : 0);
      setCurrentLineAmount(String(prevLine.amount || voucherAmount || ""));
      setCurrentLineRefName(prevLine.refName || "");
      setCurrentLineDueDate(prevLine.dueDate || date);
      setCurrentLineInvoiceId(prevLine.invoiceId);
    } else {
      const defaultRef: RefType = invoices.length > 0 ? "AGST_REF" : "NEW_REF";
      setActiveRefType(defaultRef);
      setRefTypeHighlightIndex(defaultRef === "AGST_REF" ? 1 : 2);
      setCurrentLineAmount(voucherAmount && parseFloat(voucherAmount) > 0 ? voucherAmount : "");
      setCurrentLineRefName(defaultRef === "AGST_REF" ? "" : String(voucherNo));
      setCurrentLineDueDate(date);
      setCurrentLineInvoiceId(undefined);
    }
    setShowBillWiseModal(true);
    setShowPendingBills(false);
    setShowRefTypeMenu(true);
    setTimeout(() => {
      refTypeCellRef.current?.focus();
    }, 60);
  };

  // Open Bill-wise details modal when jumping back from Narration with Backspace
  const openBillWiseDetailsFromNarration = () => {
    if (billWiseLines.length > 0) {
      const prevLine = billWiseLines[0];
      setActiveRefType(prevLine.refType);
      setCurrentLineAmount(String(prevLine.amount || voucherAmount || ""));
      setCurrentLineRefName(prevLine.refName || "");
      setCurrentLineDueDate(prevLine.dueDate || date);
      setCurrentLineInvoiceId(prevLine.invoiceId);
    } else {
      const defaultRef: RefType = invoices.length > 0 ? "AGST_REF" : "NEW_REF";
      setActiveRefType(defaultRef);
      setCurrentLineAmount(voucherAmount && parseFloat(voucherAmount) > 0 ? voucherAmount : "");
      setCurrentLineRefName(defaultRef === "AGST_REF" ? "" : String(voucherNo));
      setCurrentLineDueDate(date);
      setCurrentLineInvoiceId(undefined);
    }
    setShowBillWiseModal(true);
    setShowPendingBills(false);
    setShowRefTypeMenu(false);
    setTimeout(() => {
      modalAmountInputRef.current?.focus();
      try {
        modalAmountInputRef.current?.select();
      } catch {}
    }, 50);
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
        setCurrentLineRefName(String(voucherNo));
        setCurrentLineDueDate(date);
        setTimeout(() => {
          const el = document.getElementById("modal-ref-name-input") as HTMLInputElement;
          el?.focus();
          try { el?.select(); } catch {}
        }, 30);
      }
    } else if (refType === "NEW_REF" || refType === "ADVANCE" || refType === "ON_ACCOUNT") {
      setShowPendingBills(false);
      setCurrentLineRefName(String(voucherNo));
      if (!currentLineDueDate) setCurrentLineDueDate(date);
      setTimeout(() => {
        const el = document.getElementById("modal-ref-name-input") as HTMLInputElement;
        el?.focus();
        try { el?.select(); } catch {}
      }, 30);
    }
  };

  // Handle selecting a Pending Bill -> auto-fills invoice pending amount!
  const handleSelectPendingBill = (inv: InvoiceOption) => {
    setCurrentLineInvoiceId(inv.id);
    setCurrentLineRefName(inv.invoiceNumber);
    setCurrentLineDueDate(inv.dueDate || inv.issueDate || date);
    const invoiceDueRupees = (inv.amountDue / 100).toFixed(2);
    setCurrentLineAmount(invoiceDueRupees);
    setShowPendingBills(false);
    setShowRefTypeMenu(false);
    setTimeout(() => {
      refNameInputRef.current?.focus();
      refNameInputRef.current?.select();
    }, 50);
  };

  // Commit Bill-wise Line & Close Modal -> Auto-syncs main table voucher amount & total!
  const handleConfirmBillWiseLine = () => {
    const numAmt = parseFloat(currentLineAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      toast.error("Please enter a valid amount");
      modalAmountInputRef.current?.focus();
      return;
    }

    setVoucherAmount(numAmt.toFixed(2));

    const newLine: BillWiseLine = {
      id: Math.random().toString(36).substring(2, 9),
      refType: activeRefType,
      refName: currentLineRefName || (activeRefType === "AGST_REF" ? "INV-REF" : String(voucherNo)),
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
    if (saving) return;
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
      fuzzyMatch(c.name, customerSearch) ||
      (c.phone && fuzzyMatch(c.phone, customerSearch))
  );

  const { dateDisplay, dayDisplay } = formatTallyDate(date);

  return (
    <div className="font-sans text-slate-800 p-3 md:p-4 pt-2 md:pt-3 relative z-10 min-h-[calc(100vh-4rem)] rounded-none">
      <div className="w-full">
        {/* Ambient Soft Blue Mesh Gradient Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-[#e2ecf8]">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay" />
          <div className="absolute inset-0 bg-[radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
          <div className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-sky-200/50 blur-[130px] pointer-events-none" />
          <div className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-200/40 blur-[130px] pointer-events-none" />
          <div className="absolute top-[35%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-sky-100/60 blur-[120px] pointer-events-none" />
        </div>

        {/* Top Header Glass Card */}
        <div className="flex items-center justify-between bg-white/60 backdrop-blur-2xl p-3.5 rounded-[1.75rem] border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)] relative z-10 mb-4">
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-xl shadow-xs">F6</span>
            <span className="text-sm font-black text-slate-800 tracking-tight">Accounting Voucher Creation</span>
            <div className="h-4 w-px bg-slate-300" />
            <span className="text-xs font-bold text-slate-500">{orgName}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Receipt No.</span>
              <span className="font-mono font-black text-slate-900 bg-white/80 px-2.5 py-1 border border-slate-200 rounded-xl text-xs shadow-xs">
                {voucherNo}
              </span>
            </div>
            <div
              onClick={() => {
                setTempDate(date);
                setShowF2Modal(true);
              }}
              className="flex items-center gap-2 cursor-pointer bg-white/80 hover:bg-white px-3 py-1.5 rounded-xl border border-slate-200 transition-all shadow-xs"
              title="Press F2 to change Date"
            >
              <span className="font-black text-slate-800 text-xs">{dateDisplay}</span>
              <span className="text-slate-500 text-xs font-semibold">{dayDisplay}</span>
              <span className="text-[10px] font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black border border-blue-200">
                F2
              </span>
            </div>
          </div>
        </div>

        {/* Main Form Glass Card */}
        <div className="relative z-10 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Account (Bank/Cash) Field */}
            <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 border-b border-slate-200/70 pb-5">
              <div className="w-32 shrink-0 text-xs font-black uppercase tracking-wider text-slate-400 pt-2.5 flex items-center justify-between">
                <span>Account</span>
                <span>:</span>
              </div>
              <div className="flex-1 max-w-xl relative">
                <input
                  id="receipt-account-input"
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
                      } else {
                        setShowBankDropdown(false);
                      }
                      customerInputRef.current?.focus();
                      try { customerInputRef.current?.select(); } catch {}
                    } else if (e.key === "Tab" || e.key === "Escape") {
                      setShowBankDropdown(false);
                    }
                  }}
                  className="w-full bg-slate-50 border-2 border-slate-200 font-black text-slate-800 px-4 py-2.5 text-sm rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer transition-all shadow-xs"
                />

                {/* Current Balance under Account */}
                {selectedBank && (
                  <div className="mt-2 text-xs text-slate-500 font-medium flex items-center gap-2">
                    <span className="text-slate-400">Current balance :</span>
                    <span className="font-mono font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                      ₹ {((selectedBank.balance || 5000000) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                      Dr
                    </span>
                  </div>
                )}

                {/* Bank Accounts Dropdown */}
                {showBankDropdown && (
                  <div ref={bankDropdownRef} className="absolute left-0 top-full mt-1.5 w-full bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-2xl z-50 rounded-2xl overflow-hidden">
                    <div className="bg-[#1e3a5f] text-white text-xs font-bold px-4 py-2 flex justify-between items-center">
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
                            try { customerInputRef.current?.select(); } catch {}
                          }}
                          onMouseEnter={() => setBankHighlightIndex(idx)}
                          className={`px-4 py-3 text-xs flex justify-between items-center cursor-pointer transition-colors ${
                            idx === bankHighlightIndex ? "bg-blue-50 font-bold text-blue-900" : "hover:bg-slate-50 text-slate-800"
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
            <div className="rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-md overflow-visible shadow-xs">
              {/* Table Header */}
              <div className="bg-slate-100/70 border-b border-slate-200 px-5 py-3 flex justify-between text-xs font-black uppercase text-slate-400 tracking-widest">
                <span className="w-2/3">Particulars</span>
                <span className="w-1/3 text-right">Amount (₹)</span>
              </div>

              {/* Row 1: Customer Ledger */}
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-6">
                  {/* Particulars (Customer Search) */}
                  <div className="w-2/3 relative">
                    <input
                      id="receipt-customer-input"
                      ref={customerInputRef}
                      type="text"
                      placeholder="Type or select Customer Name..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        setCustomerHighlightIndex(0);
                      }}
                      onClick={() => setShowCustomerDropdown(true)}
                      onFocus={() => {
                        setShowCustomerDropdown(true);
                        try {
                          customerInputRef.current?.select();
                        } catch {}
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
                          e.stopPropagation();
                          let chosenCust = selectedCustomer;
                          if (showCustomerDropdown && filteredCustomers[customerHighlightIndex]) {
                            chosenCust = filteredCustomers[customerHighlightIndex];
                            setSelectedCustomerId(chosenCust.id);
                            setCustomerSearch(chosenCust.name);
                          }
                          setShowCustomerDropdown(false);
                          setTimeout(() => {
                            openBillWiseDetails(chosenCust || undefined);
                          }, 50);
                        } else if (e.key === "Escape") {
                          setShowCustomerDropdown(false);
                        } else if (e.key === "Backspace") {
                          const len = customerSearch.length;
                          const atStartOrSelected =
                            !customerSearch ||
                            (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) ||
                            (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === len);
                          if (atStartOrSelected) {
                            e.preventDefault();
                            setShowCustomerDropdown(false);
                            accountInputRef.current?.focus();
                          }
                        }
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-200 font-bold text-slate-900 px-4 py-2.5 text-sm rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                    />

                    {/* Customer Current Balance */}
                    {selectedCustomer && (
                      <div className="mt-2 text-xs text-slate-500 font-medium flex items-center gap-2">
                        <span className="text-slate-400">Cur Bal :</span>
                        <span className="font-mono font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
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
                      <div ref={customerDropdownRef} className="absolute left-0 top-full mt-1.5 w-full bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-2xl z-50 rounded-2xl overflow-hidden">
                        <div className="bg-[#1e3a5f] text-white text-xs font-bold px-4 py-2 flex justify-between items-center">
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
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerSearch(c.name);
                                  setShowCustomerDropdown(false);
                                  setTimeout(() => {
                                    openBillWiseDetails(c);
                                  }, 50);
                                }}
                                onMouseEnter={() => setCustomerHighlightIndex(idx)}
                                className={`px-4 py-3 text-xs flex justify-between items-center cursor-pointer transition-colors ${
                                  idx === customerHighlightIndex
                                    ? "bg-blue-50 font-bold text-blue-900"
                                    : "hover:bg-slate-50 text-slate-800"
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

                  {/* Amount Column - Auto-calculated from Bill-Wise details */}
                  <div className="w-1/3 flex items-center justify-end gap-2">
                    <input
                      id="receipt-amount-input"
                      ref={amountInputRef}
                      type="text"
                      readOnly
                      placeholder="0.00"
                      value={voucherAmount ? Number(voucherAmount).toFixed(2) : "0.00"}
                      onClick={() => openBillWiseDetails()}
                      onFocus={() => openBillWiseDetails()}
                      className="w-full max-w-[220px] text-right bg-slate-50/80 border-2 border-slate-200 font-mono font-black text-slate-900 px-4 py-2.5 text-base rounded-xl cursor-pointer hover:bg-slate-100 focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                      title="Calculated from Bill-wise details. Click or press Enter to edit."
                    />
                    <span className="font-black text-xs text-slate-500">Cr</span>
                  </div>
                </div>

                {/* Rendered Bill-wise Sub-lines under Customer */}
                {billWiseLines.length > 0 && (
                  <div className="pl-6 pt-2 space-y-1.5">
                    {billWiseLines.map((line) => (
                      <div
                        key={line.id}
                        onClick={() => openBillWiseDetails()}
                        className="flex items-center justify-between text-xs font-mono text-slate-800 bg-blue-50/80 border border-blue-200/80 px-4 py-2 rounded-xl cursor-pointer hover:bg-blue-100/90 transition-all shadow-2xs"
                        title="Click or press Enter on amount to edit bill-wise details"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-extrabold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded-lg border border-blue-200">
                            {line.refType === "AGST_REF"
                              ? "Agst Ref"
                              : line.refType === "NEW_REF"
                              ? "New Ref"
                              : line.refType === "ADVANCE"
                              ? "Advance"
                              : "On Account"}
                          </span>
                          <span className="font-bold text-slate-700">{line.refName}</span>
                          {line.dueDate && (
                            <span className="text-slate-500 text-[10px]">Due: {line.dueDate}</span>
                          )}
                        </div>
                        <span className="font-black text-slate-900">
                          ₹ {Number(line.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Table Total Footer */}
              <div className="bg-slate-100/60 border-t border-slate-200 px-6 py-3 flex justify-between items-center text-sm font-black">
                <span className="text-slate-500 uppercase tracking-widest text-xs">Total</span>
                <span className="font-mono text-slate-900 text-lg">
                  ₹ {parseFloat(voucherAmount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Narration Section */}
            <div className="flex items-start gap-4 border-t border-slate-200/70 pt-5">
              <div className="w-32 shrink-0 text-xs font-black uppercase tracking-wider text-slate-400 pt-2.5 flex items-center justify-between">
                <span>Narration</span>
                <span>:</span>
              </div>
              <div className="flex-1 max-w-xl">
                <textarea
                  id="receipt-narration-input"
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
                    } else if (e.key === "Backspace") {
                      const len = narration.length;
                      const atStartOrSelected =
                        !narration ||
                        (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) ||
                        (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === len);
                      if (atStartOrSelected) {
                        e.preventDefault();
                        if (parseFloat(voucherAmount || "0") > 0) {
                          openBillWiseDetailsFromNarration();
                        } else {
                          amountInputRef.current?.focus();
                          try {
                            amountInputRef.current?.select();
                          } catch {}
                        }
                      }
                    }
                  }}
                  placeholder="Enter narration or press Enter to Accept..."
                  className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 font-medium px-4 py-2.5 text-sm rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Hint Bar */}
          <div className="border-t border-slate-200/70 pt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1 rounded-xl border border-slate-200 font-medium">
                <kbd className="bg-slate-100 text-blue-600 px-1.5 py-0.5 rounded font-black font-mono text-[10px]">F2</kbd> Date
              </span>
              <span className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1 rounded-xl border border-slate-200 font-medium">
                <kbd className="bg-slate-100 text-blue-600 px-1.5 py-0.5 rounded font-black font-mono text-[10px]">Ctrl+A</kbd> Accept
              </span>
              <span className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1 rounded-xl border border-slate-200 font-medium">
                <kbd className="bg-slate-100 text-blue-600 px-1.5 py-0.5 rounded font-black font-mono text-[10px]">Esc</kbd> Cancel
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (validateBeforeAccept()) setShowAcceptDialog(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>Accept (Save)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. BILL-WISE DETAILS MODAL (Glassmorphic design matching Proxy Order) */}
      {/* ========================================================================= */}
      {showBillWiseModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-3xl border border-white/80 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[2rem] w-full max-w-3xl overflow-visible animate-in fade-in zoom-in-95 duration-150 relative p-6 space-y-5">
            {/* Modal Header */}
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Bill-wise Details for :</span>
                <span className="bg-blue-50 text-blue-800 font-extrabold text-xs px-3 py-1 rounded-xl border border-blue-200/60 shadow-2xs">
                  {selectedCustomer?.name || "Customer"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Up to:</span>
                <span className="font-mono font-black text-xs bg-slate-900 text-white px-3 py-1 rounded-xl shadow-xs">
                  ₹ {parseFloat(voucherAmount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })} Cr
                </span>
              </div>
            </div>

            {/* Modal Table Body */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-md overflow-visible shadow-xs">
              <table className="w-full text-xs text-left overflow-visible">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-40">Type of Ref</th>
                    <th className="px-4 py-3 min-w-[160px]">Name (Ref / Bill No)</th>
                    <th className="px-4 py-3 w-44">Due Date, or credit Days</th>
                    <th className="px-4 py-3 text-right w-36">Amount</th>
                    <th className="px-4 py-3 text-center w-16">Dr/Cr</th>
                  </tr>
                </thead>
                <tbody className="overflow-visible divide-y divide-slate-100">
                  <tr className="bg-blue-50/20 overflow-visible transition-colors">
                    {/* Type of Ref Cell */}
                    <td className="px-4 py-3 font-black text-blue-900 relative overflow-visible">
                      <div
                        ref={refTypeCellRef}
                        tabIndex={0}
                        onClick={() => {
                          setShowPendingBills(false);
                          setShowRefTypeMenu(true);
                          setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex((o) => o.type === activeRefType));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (showRefTypeMenu) {
                              const selected = REF_TYPE_OPTIONS[refTypeHighlightIndex];
                              if (selected) {
                                handleSelectRefType(selected.type as RefType);
                              }
                            } else {
                              setShowPendingBills(false);
                              setShowRefTypeMenu(false);
                              const el = document.getElementById("modal-ref-name-input") as HTMLInputElement;
                              el?.focus();
                              try {
                                el?.select();
                              } catch {}
                            }
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!showRefTypeMenu) {
                              setShowRefTypeMenu(true);
                            } else {
                              setRefTypeHighlightIndex((prev) => (prev + 1) % REF_TYPE_OPTIONS.length);
                            }
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!showRefTypeMenu) {
                              setShowRefTypeMenu(true);
                            } else {
                              setRefTypeHighlightIndex((prev) => (prev - 1 + REF_TYPE_OPTIONS.length) % REF_TYPE_OPTIONS.length);
                            }
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowRefTypeMenu(false);
                          } else if (e.key === "Backspace") {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowRefTypeMenu(false);
                            setShowPendingBills(false);
                            setShowBillWiseModal(false);
                            customerInputRef.current?.focus();
                            try {
                              customerInputRef.current?.select();
                            } catch {}
                          }
                        }}
                        className="cursor-pointer bg-white border-2 border-slate-200 hover:border-blue-500 flex items-center justify-between py-2 px-3 gap-2 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 rounded-xl transition-all shadow-xs"
                      >
                        <span className="font-bold text-slate-900">
                          {activeRefType === "AGST_REF"
                            ? "Agst Ref"
                            : activeRefType === "NEW_REF"
                            ? "New Ref"
                            : activeRefType === "ADVANCE"
                            ? "Advance"
                            : "On Account"}
                        </span>
                        <span className="text-blue-500 text-xs">▾</span>
                      </div>

                      {/* Method of Adj. Floating Popup */}
                      {showRefTypeMenu && (
                        <div className="absolute left-4 top-full mt-2 w-52 bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-2xl z-[100] rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                          <div className="bg-[#1e3a5f] text-white font-extrabold px-4 py-2.5 text-xs flex justify-between items-center">
                            <span>Method of Adj.</span>
                            <span className="text-amber-300 font-mono text-[10px] font-normal">↑↓ · Enter</span>
                          </div>
                          <div className="divide-y divide-slate-100 text-xs font-semibold p-1">
                            {REF_TYPE_OPTIONS.map((opt, idx) => (
                              <div
                                key={opt.type}
                                id={`reftype-opt-${idx}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRefType(opt.type as RefType);
                                }}
                                onMouseEnter={() => setRefTypeHighlightIndex(idx)}
                                className={`px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors ${
                                  idx === refTypeHighlightIndex
                                    ? "bg-blue-50 font-black text-blue-900"
                                    : "hover:bg-slate-50 text-slate-700"
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
                    <td className="px-4 py-3">
                      <input
                        id="modal-ref-name-input"
                        ref={refNameInputRef}
                        type="text"
                        value={currentLineRefName}
                        onChange={(e) => setCurrentLineRefName(e.target.value)}
                        onFocus={() => {
                          setShowRefTypeMenu(false);
                          setShowPendingBills(false);
                          try {
                            refNameInputRef.current?.select();
                          } catch {}
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            dueDateInputRef.current?.focus();
                            try {
                              dueDateInputRef.current?.select();
                            } catch {}
                          } else if (e.key === "Backspace") {
                            const len = currentLineRefName.length;
                            const atStartOrSelected =
                              !currentLineRefName ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === len);
                            if (atStartOrSelected) {
                              e.preventDefault();
                              setShowPendingBills(false);
                              setShowRefTypeMenu(true);
                              setRefTypeHighlightIndex(REF_TYPE_OPTIONS.findIndex((o) => o.type === activeRefType));
                              setTimeout(() => refTypeCellRef.current?.focus(), 20);
                            }
                          }
                        }}
                        placeholder={activeRefType === "AGST_REF" ? "Invoice No..." : String(voucherNo)}
                        title="Reference / Bill / Invoice Number"
                        className="w-full bg-slate-50 border-2 border-slate-200 px-3 py-2 text-xs font-bold text-slate-900 rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                      />
                    </td>

                    {/* Due Date Cell */}
                    <td className="px-4 py-3">
                      <input
                        id="modal-due-date-input"
                        ref={dueDateInputRef}
                        type="text"
                        value={currentLineDueDate}
                        onChange={(e) => setCurrentLineDueDate(e.target.value)}
                        onFocus={() => {
                          setShowRefTypeMenu(false);
                          setShowPendingBills(false);
                          try {
                            dueDateInputRef.current?.select();
                          } catch {}
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            modalAmountInputRef.current?.focus();
                            try {
                              modalAmountInputRef.current?.select();
                            } catch {}
                          } else if (e.key === "Backspace") {
                            const len = currentLineDueDate.length;
                            const atStartOrSelected =
                              !currentLineDueDate ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === len);
                            if (atStartOrSelected) {
                              e.preventDefault();
                              refNameInputRef.current?.focus();
                              try {
                                refNameInputRef.current?.select();
                              } catch {}
                            }
                          }
                        }}
                        placeholder="Due date / days"
                        className="w-full bg-slate-50 border-2 border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800 rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                      />
                    </td>

                    {/* Amount Cell */}
                    <td className="px-4 py-3 text-right">
                      <input
                        id="modal-amount-input"
                        ref={modalAmountInputRef}
                        type="number"
                        step="0.01"
                        value={currentLineAmount}
                        onChange={(e) => setCurrentLineAmount(e.target.value)}
                        onFocus={() => {
                          setShowRefTypeMenu(false);
                          setShowPendingBills(false);
                          try {
                            modalAmountInputRef.current?.select();
                          } catch {}
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleConfirmBillWiseLine();
                          } else if (e.key === "Backspace") {
                            const len = currentLineAmount.length;
                            const atStartOrSelected =
                              !currentLineAmount ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) ||
                              (e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === len);
                            if (atStartOrSelected) {
                              e.preventDefault();
                              dueDateInputRef.current?.focus();
                              try {
                                dueDateInputRef.current?.select();
                              } catch {}
                            }
                          }
                        }}
                        className="w-32 text-right bg-slate-50 border-2 border-slate-200 px-3 py-2 text-xs font-mono font-black text-slate-900 rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all shadow-xs"
                      />
                    </td>

                    {/* Dr/Cr Cell */}
                    <td className="px-4 py-3 text-center font-black text-slate-800">Cr</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBillWiseModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shadow-2xs cursor-pointer"
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={handleConfirmBillWiseLine}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <span>Confirm (Enter)</span>
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Pending Bills Popup */}
            {showPendingBills && (
              <div className="absolute top-16 right-4 w-[460px] bg-white/95 backdrop-blur-3xl border border-slate-200 shadow-2xl z-[100] rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <div className="bg-[#1e3a5f] text-white px-4 py-3 text-xs font-black flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span>Pending Bills</span>
                    <span className="text-[10px] font-normal text-blue-200">({invoices.length} available)</span>
                  </span>
                  <span className="text-[10px] text-amber-300 font-mono">↑↓ to navigate · Enter pick</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-black uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Invoice #</th>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5 text-right">Balance Due</th>
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
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPendingBill(inv);
                            }}
                            onMouseEnter={() => setPendingBillHighlightIndex(idx)}
                            className={`cursor-pointer transition-colors ${
                              idx === pendingBillHighlightIndex
                                ? "bg-blue-50 font-black text-blue-900"
                                : "hover:bg-slate-50 text-slate-800 font-medium"
                            }`}
                          >
                            <td className="px-4 py-2.5 font-black">{inv.invoiceNumber}</td>
                            <td className="px-4 py-2.5 text-slate-600 font-mono">{inv.issueDate || "-"}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-700">
                              ₹ {(inv.amountDue / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} Dr
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-3xl border border-white/80 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[2rem] p-6 w-96 text-center space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60 shadow-xs">
              <Check className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Accept Voucher?</h3>
              <p className="text-xs text-slate-500 font-medium">
                Post Receipt Voucher No. <span className="font-mono font-bold text-slate-800">{voucherNo}</span> for{" "}
                <span className="font-mono font-black text-blue-600">
                  ₹ {parseFloat(voucherAmount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                autoFocus={acceptFocusYes}
                onClick={handlePostVoucher}
                disabled={saving}
                className={`px-6 py-2.5 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  acceptFocusYes
                    ? "bg-blue-600 text-white ring-4 ring-blue-500/20 scale-[1.03]"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <span>{saving ? "Posting..." : "Yes"}</span>
                <span className="text-[10px] font-mono opacity-80">(Y / ↵)</span>
              </button>
              <button
                type="button"
                autoFocus={!acceptFocusYes}
                onClick={() => {
                  setShowAcceptDialog(false);
                  narrationInputRef.current?.focus();
                }}
                className={`px-6 py-2.5 font-bold text-xs rounded-xl transition-all cursor-pointer ${
                  !acceptFocusYes
                    ? "border-2 border-slate-400 bg-slate-100 text-slate-900 ring-4 ring-slate-300/30 scale-[1.03]"
                    : "border border-slate-200 hover:bg-slate-100 text-slate-700 bg-white"
                }`}
              >
                <span>No</span>
                <span className="text-[10px] font-mono opacity-60 ml-1">(N / Esc)</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">← → or Tab to toggle · Enter to confirm</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. F2 VOUCHER DATE CHANGE MODAL */}
      {/* ========================================================================= */}
      {showF2Modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-3xl border border-white/80 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[2rem] p-6 w-96 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <span className="text-sm font-black text-slate-900">Change Voucher Date</span>
              <span className="font-mono text-xs font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg border border-blue-200">
                F2
              </span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Voucher Date</label>
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
                className="w-full bg-slate-50 border-2 border-slate-200 font-mono font-bold text-slate-900 px-4 py-2.5 text-sm rounded-xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowF2Modal(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDate(tempDate);
                  setShowF2Modal(false);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer"
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
