'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Plus, Trash2, Search, Upload, Printer, ChevronDown, Check, Image as ImageIcon, Star, AlertTriangle, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { INDIAN_STATES } from '@/lib/constants';
import { openTiffInSystem, sanitizeTiffPath } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';
import { ItemDescriptionModal } from '@/components/dashboard/ItemDescriptionModal';
import { searchProducts } from '@/lib/actions/products';

function isoToDisplayDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

function parseTallyDate(input: string, fallbackIso: string = new Date().toISOString().split('T')[0]): string {
  if (!input || !input.trim()) return fallbackIso;
  const raw = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const parts = raw.split(/[\s\-\/\.]+/).filter(Boolean);

  if (parts.length === 1) {
    const digits = parts[0];
    if (digits.length === 1 || digits.length === 2) {
      const day = parseInt(digits, 10);
      if (day >= 1 && day <= 31) {
        return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 4) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 6) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      let year = parseInt(digits.slice(4, 6), 10);
      year = year < 50 ? 2000 + year : 1900 + year;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      const year = parseInt(digits.slice(4, 8), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  } else if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  } else if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return fallbackIso;
}

function HighlightMatch({ text, query, isHighlighted }: { text: string; query: string; isHighlighted?: boolean }) {
  if (!text) return null;
  const q = (query || '').trim();
  if (!q) return <>{text}</>;

  const cleanQ = q.replace(/^ct[:\s\-\/]?\s*/i, '').trim();
  if (!cleanQ) return <>{text}</>;

  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;

  const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={i}
              className={
                isHighlighted
                  ? 'bg-black text-amber-300 font-extrabold px-0.5 rounded-xs underline decoration-amber-400'
                  : 'bg-amber-300/90 text-amber-950 font-extrabold px-0.5 rounded-xs shadow-2xs'
              }
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function ProxyOrderBuilderView({ vm }: { vm: any }) {
  const {
    bootstrapLoading, profile, roles, customerSearch, setCustomerSearch, customerSearching,
    selectedCustomerId, setSelectedCustomerId, filteredCustomers,
    selectedCustomer, rows, addRow, updateRow, removeRow, products, setProducts,
    calculateRowSubtotal, paymentMode, setPaymentMode, deliveryType,
    setDeliveryType, shippingAddress, setShippingAddress, upiUploading,
    upiPreview, upiProofUrl, handleUpload, showCreateCustomer,
    setShowCreateCustomer, creatingCustomer, createdCustomer,
    newCustomerForm, setNewCustomerForm, handleCreateCustomer,
    setTiffError, tiffError, notes, setNotes, summary, submitProxyOrder,
    loading, addingAddress, handleAddDeliveryAddress, applyVoucher, setApplyVoucher,
    verifyingGst, handleVerifyGst,
    orderNumber, setOrderNumber, orderDate, setOrderDate
  } = vm;

  const [dateDisplayInput, setDateDisplayInput] = useState(() => isoToDisplayDate(orderDate || new Date().toISOString().split('T')[0]));

  useEffect(() => {
    if (orderDate) {
      setDateDisplayInput(isoToDisplayDate(orderDate));
    }
  }, [orderDate]);

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearching, setProductSearching] = useState(false);

  // Debounced live server search for products across entire catalog
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) {
      setProductSearching(false);
      return;
    }

    const activeRow = rows.find((r: any) => r.id === openRowId);
    const selProd = activeRow ? products.find((p: any) => p.id === activeRow.productId) : null;
    if (selProd && term.toLowerCase() === (selProd.name || '').toLowerCase()) {
      setProductSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setProductSearching(true);
      try {
        const cleanTerm = term.replace(/^ct[:\s\-\/]?\s*/i, '').trim();
        if (!cleanTerm) return;
        const results = await searchProducts(cleanTerm, 50);
        if (results && results.length > 0 && !cancelled && setProducts) {
          setProducts((prev: any[]) => {
            const map = new Map();
            prev.forEach((p: any) => map.set(p.id, p));
            results.forEach((p: any) => map.set(p.id, p));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('Server product search failed:', err);
      } finally {
        if (!cancelled) setProductSearching(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, openRowId, rows, products, setProducts]);
  const [highlightProductIndex, setHighlightProductIndex] = useState<number>(0);
  const [highlightCustomerIndex, setHighlightCustomerIndex] = useState<number>(0);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [logisticsDropdownOpen, setLogisticsDropdownOpen] = useState(false);
  const [highlightLogisticsIndex, setHighlightLogisticsIndex] = useState<number>(0);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [highlightPaymentIndex, setHighlightPaymentIndex] = useState<number>(0);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showConfirmOrderModal, setShowConfirmOrderModal] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [paymentMethodTab, setPaymentMethodTab] = useState<'CASH_UPI' | 'CREDIT'>('CASH_UPI');
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const [rowUploading, setRowUploading] = useState<Record<string, boolean>>({});
  const [activeDescRowId, setActiveDescRowId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const tallyNaturalCompare = (aStr: any, bStr: any) => {
    return String(aStr || '').trim().localeCompare(String(bStr || '').trim(), undefined, { numeric: true, sensitivity: 'base' });
  };

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    (products || []).forEach((p: any) => {
      const cat = (p.category || '').trim();
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort((a, b) => tallyNaturalCompare(a, b));
  }, [products]);

  const matchProducts = (query: string, customCat: string | null = selectedCategory) => {
    const catFiltered = customCat
      ? products.filter((p: any) => (p.category || '').trim().toLowerCase() === customCat.trim().toLowerCase())
      : products;

    const qTrim = query.trim().toLowerCase();
    if (!qTrim) {
      return [...catFiltered].sort((a: any, b: any) => tallyNaturalCompare(a.name, b.name));
    }

    // Check if query begins with "ct " or "ct:" or "ct-" or "ct/" or is exactly "ct"
    const isCtSearch = /^ct([:\s\-\/]|$)/i.test(qTrim);

    if (isCtSearch) {
      const ctQuery = qTrim.replace(/^ct[:\s\-\/]?\s*/i, '').trim();
      if (!ctQuery) {
        // Just typed "ct" -> show all products in natural order
        return [...catFiltered].sort((a: any, b: any) => tallyNaturalCompare(a.name, b.name));
      }

      const ctTokens = ctQuery.split(/\s+/).filter(Boolean);
      const catSearchTerm = ctTokens[0];
      const itemTokens = ctTokens.slice(1);

      return catFiltered
        .filter((p: any) => {
          const cat = (p.category || '').toLowerCase();
          const fullTarget = `${p.name || ''} ${p.id || ''} ${p.code || ''} ${p.sku || ''}`.toLowerCase();

          // 1. Direct match: entire ctQuery is in category
          if (cat.includes(ctQuery)) return true;

          // 2. Token match: first token matches category, remaining tokens match product fields
          if (cat.includes(catSearchTerm)) {
            return itemTokens.length === 0 || itemTokens.every(tok => fullTarget.includes(tok));
          }

          return false;
        })
        .sort((a: any, b: any) => {
          const aCat = (a.category || '').toLowerCase();
          const bCat = (b.category || '').toLowerCase();

          // Exact category matches first
          const aExact = aCat === ctQuery || aCat === catSearchTerm;
          const bExact = bCat === ctQuery || bCat === catSearchTerm;
          if (aExact && !bExact) return -1;
          if (bExact && !aExact) return 1;

          // Category starts with query
          const aStarts = aCat.startsWith(ctQuery) || aCat.startsWith(catSearchTerm);
          const bStarts = bCat.startsWith(ctQuery) || bCat.startsWith(catSearchTerm);
          if (aStarts && !bStarts) return -1;
          if (bStarts && !aStarts) return 1;

          return tallyNaturalCompare(a.name, b.name);
        });
    }

    // Standard token search
    const qTokens = qTrim.split(/\s+/).filter(Boolean);
    return catFiltered
      .filter((p: any) => {
        const aliases = Array.isArray(p.metadata?.aliases) ? p.metadata.aliases.join(' ') : '';
        const target = `${p.name || ''} ${p.id || ''} ${p.code || ''} ${p.sku || ''} ${p.category || ''} ${aliases}`.toLowerCase();
        return qTokens.every(tok => target.includes(tok));
      })
      .sort((a: any, b: any) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const aAliases: string[] = Array.isArray(a.metadata?.aliases) ? a.metadata.aliases.map((al: string) => al.toLowerCase()) : [];
        const bAliases: string[] = Array.isArray(b.metadata?.aliases) ? b.metadata.aliases.map((al: string) => al.toLowerCase()) : [];

        // 0. Exact alias match gets top priority (e.g. typing "A2")
        const aAliasExact = aAliases.includes(qTrim);
        const bAliasExact = bAliases.includes(qTrim);
        if (aAliasExact && !bAliasExact) return -1;
        if (bAliasExact && !aAliasExact) return 1;

        // 1. Exact match gets highest priority
        if (aName === qTrim && bName !== qTrim) return -1;
        if (bName === qTrim && aName !== qTrim) return 1;
        // 2. Name starts with query
        const aStarts = aName.startsWith(qTrim);
        const bStarts = bName.startsWith(qTrim);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        // 3. Name contains query vs only category contains
        const aInName = aName.includes(qTrim);
        const bInName = bName.includes(qTrim);
        if (aInName && !bInName) return -1;
        if (bInName && !aInName) return 1;
        // 4. All tokens match in name
        const aTokensInName = qTokens.every(tok => aName.includes(tok));
        const bTokensInName = qTokens.every(tok => bName.includes(tok));
        if (aTokensInName && !bTokensInName) return -1;
        if (bTokensInName && !aTokensInName) return 1;
        return tallyNaturalCompare(a.name, b.name);
      });
  };

  const matchedProducts = useMemo(() => {
    return matchProducts(searchQuery, selectedCategory);
  }, [products, searchQuery, selectedCategory]);

  const sortedCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = [...(filteredCustomers || [])];
    if (!term) {
      return list.sort((a: any, b: any) =>
        tallyNaturalCompare(a.displayName || a.name, b.displayName || b.name)
      );
    }
    return list.sort((a: any, b: any) => {
      const aName = String(a.displayName || a.name || '').toLowerCase();
      const bName = String(b.displayName || b.name || '').toLowerCase();
      if (aName === term && bName !== term) return -1;
      if (bName === term && aName !== term) return 1;
      if (aName.startsWith(term) && !bName.startsWith(term)) return -1;
      if (bName.startsWith(term) && !aName.startsWith(term)) return 1;
      return tallyNaturalCompare(a.displayName || a.name, b.displayName || b.name);
    });
  }, [filteredCustomers, customerSearch]);

  const [productLimit, setProductLimit] = useState(100);
  const [customerLimit, setCustomerLimit] = useState(100);

  // Reset limit to 100 on new search or when opening drawer for instant 1ms rendering
  useEffect(() => {
    setProductLimit(100);
  }, [searchQuery, selectedCategory, openRowId]);

  useEffect(() => {
    setCustomerLimit(100);
  }, [customerSearch, customerDropdownOpen]);

  // Expand limit if user navigates with arrows near boundary
  useEffect(() => {
    if (highlightProductIndex >= productLimit - 15) {
      setProductLimit(prev => Math.max(prev, highlightProductIndex + 50));
    }
  }, [highlightProductIndex, productLimit]);

  useEffect(() => {
    if (highlightCustomerIndex >= customerLimit - 15) {
      setCustomerLimit(prev => Math.max(prev, highlightCustomerIndex + 50));
    }
  }, [highlightCustomerIndex, customerLimit]);

  const visibleProducts = useMemo(() => {
    const limit = Math.max(productLimit, highlightProductIndex + 20);
    return matchedProducts.slice(0, limit);
  }, [matchedProducts, productLimit, highlightProductIndex]);

  const visibleCustomers = useMemo(() => {
    const limit = Math.max(customerLimit, highlightCustomerIndex + 20);
    return sortedCustomers.slice(0, limit);
  }, [sortedCustomers, customerLimit, highlightCustomerIndex]);

  const handleProductScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setProductLimit(prev => Math.min(matchedProducts.length, prev + 100));
    }
  };

  const handleCustomerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setCustomerLimit(prev => Math.min(sortedCustomers.length, prev + 100));
    }
  };

  // High performance instant scroll on Arrow navigation (bypasses 2600-element ref thrashing)
  useEffect(() => {
    if (openRowId && highlightProductIndex >= 0) {
      const el = document.getElementById(`stock-item-${highlightProductIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightProductIndex, openRowId]);

  useEffect(() => {
    if (customerDropdownOpen && highlightCustomerIndex >= 0) {
      const el = document.getElementById(`customer-item-${highlightCustomerIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightCustomerIndex, customerDropdownOpen]);

  const LOGISTICS_OPTIONS = useMemo(() => [
    { id: 'selfPickup', label: 'PICKUP', sublabel: 'Self Collection at Store', key: 'p' },
    { id: 'door', label: 'DOOR', sublabel: 'Direct Door Delivery', key: 'd' },
    { id: 'courier', label: 'COURIER', sublabel: 'Dispatch via Courier Service', key: 'c' },
    { id: 'transport', label: 'TRANSPORT', sublabel: 'Freight / Transport Service', key: 't' },
  ], []);

  const handleSaveDescAndAdvance = (rowId: string, text: string) => {
    updateRow(rowId, { description: text, projectName: text });
    setActiveDescRowId(null);
    const rowObj = rows.find((r: any) => r.id === rowId);
    const p = products.find((prod: any) => prod.id === rowObj?.productId);
    const rawUom = String((p as any)?.unit_of_measure || (p as any)?.tally_uom || 'sqft').trim().toLowerCase();
    const cleanUom = rawUom.replace(/[\s\._-]/g, '');
    const hasMultipleSizes = Boolean((p as any)?.has_multiple_sizes ?? (p as any)?.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf'));
    
    setTimeout(() => {
      if (hasMultipleSizes) {
        const widthInput = document.getElementById(`error-row-${rowId}-width`);
        if (widthInput) {
          widthInput.focus();
        } else {
          const qtyInput = document.getElementById(`error-row-${rowId}-quantity`);
          if (qtyInput) {
            qtyInput.focus();
          }
        }
      } else {
        const qtyInput = document.getElementById(`error-row-${rowId}-quantity`);
        if (qtyInput) {
          qtyInput.focus();
        }
      }
    }, 60);
  };

  const handleBackFromDescModal = (rowId: string) => {
    setActiveDescRowId(null);
    setTimeout(() => {
      const itemInput = document.getElementById(`row-${rowId}-product-input`);
      if (itemInput) {
        setOpenRowId(rowId);
        itemInput.focus();
      }
    }, 50);
  };

  useEffect(() => {
    const handleExitRequest = () => {
      if (customerDropdownOpen) {
        setCustomerDropdownOpen(false);
        return;
      }
      if (openRowId) {
        setOpenRowId(null);
        return;
      }
      if (openUnitPickerId) {
        setOpenUnitPickerId(null);
        return;
      }
      if (showAddressModal) {
        setShowAddressModal(false);
        return;
      }
      if (showCreditModal) {
        setShowCreditModal(false);
        return;
      }
      if (showConfirmOrderModal) {
        setShowConfirmOrderModal(false);
        return;
      }
      if (showCreateCustomer) {
        setShowCreateCustomer(false);
        return;
      }
      setShowExitConfirmModal(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        const dateInput = document.getElementById('order-date-input') as HTMLInputElement;
        if (dateInput) {
          dateInput.focus();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (showExitConfirmModal) {
          e.preventDefault();
          e.stopPropagation();
          setShowExitConfirmModal(false);
          return;
        }
        if (customerDropdownOpen || openRowId || openUnitPickerId || showAddressModal || showCreditModal || showConfirmOrderModal || showCreateCustomer) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setShowExitConfirmModal(true);
      }
    };

    window.addEventListener('request-exit-proxy-order', handleExitRequest);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('request-exit-proxy-order', handleExitRequest);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showExitConfirmModal, customerDropdownOpen, openRowId, openUnitPickerId, showAddressModal, showCreditModal, showConfirmOrderModal, showCreateCustomer]);

  // Keyboard shortcut listener for Confirm Order Placement Modal (Y/Enter = Yes, N/Esc = No)
  useEffect(() => {
    if (!showConfirmOrderModal) return;
    const handleConfirmKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setShowConfirmOrderModal(false);
        if (paymentMethodTab === 'CREDIT') {
          setShowCreditModal(true);
        } else {
          submitProxyOrder();
        }
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowConfirmOrderModal(false);
        setTimeout(() => {
          const submitBtn = document.getElementById("submit-order-btn");
          if (submitBtn) submitBtn.focus();
        }, 50);
      }
    };
    window.addEventListener('keydown', handleConfirmKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleConfirmKeyDown, true);
    };
  }, [showConfirmOrderModal, paymentMethodTab, submitProxyOrder]);

  useEffect(() => {
    if (showAddressModal) {
      setOpenRowId(null);
      setCustomerDropdownOpen(false);
      const timer = setTimeout(() => {
        const firstModalInput = document.getElementById("modal-house-no") as HTMLInputElement;
        if (firstModalInput) {
          firstModalInput.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showAddressModal]);

  const lastFocusedElementIdRef = useRef<string | null>(null);

  // Keep track of the last focused input/select/button on the page
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.id) {
        if (!target.closest('[role="dialog"]') && !target.id.startsWith('modal-')) {
          lastFocusedElementIdRef.current = target.id;
        }
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // Smart Focus Recovery: If user clicks outside and focus lands on background / body,
  // pressing Enter, Backspace, Arrow keys, or typing instantly restores focus to their last active box!
  useEffect(() => {
    const handleGlobalFocusRestore = (e: KeyboardEvent) => {
      if (
        showExitConfirmModal ||
        showConfirmOrderModal ||
        showAddressModal ||
        showCreditModal ||
        showCreateCustomer ||
        activeDescRowId ||
        showCustomerMasterModal
      ) {
        return;
      }

      const activeEl = document.activeElement;
      const isBodyOrBg = !activeEl || activeEl === document.body || activeEl.tagName === 'BODY' || activeEl.tagName === 'HTML' || activeEl.id === '__next' || (activeEl.tagName === 'DIV' && !activeEl.getAttribute('tabindex'));

      if (isBodyOrBg) {
        if (['Control', 'Alt', 'Shift', 'Meta', 'F12', 'F5'].includes(e.key)) return;

        const targetId = lastFocusedElementIdRef.current;
        let targetEl = targetId ? document.getElementById(targetId) : null;

        if (!targetEl) {
          if (rows && rows.length > 0) {
            targetEl = document.getElementById(`row-${rows[0].id}-product-input`);
          }
          if (!targetEl) {
            targetEl = document.getElementById('proxy-customer-search-input');
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

    window.addEventListener('keydown', handleGlobalFocusRestore);
    return () => window.removeEventListener('keydown', handleGlobalFocusRestore);
  }, [
    showExitConfirmModal,
    showConfirmOrderModal,
    showAddressModal,
    showCreditModal,
    showCreateCustomer,
    activeDescRowId,
    showCustomerMasterModal,
    rows
  ]);

  const handleRowFileSelect = async (rowId: string, file: File) => {
    // 1. Instantly display filename and prepare local blob preview
    const blobUrl = URL.createObjectURL(file);
    updateRow(rowId, { tiffPath: file.name, fileName: file.name, blobUrl });
    setValidationErrors((prev) => ({ ...prev, [`row-${rowId}-file`]: '' }));

    // 2. Upload to server in background so 40.81.236.61 and all PCs can open it
    setRowUploading((prev) => ({ ...prev, [rowId]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', `order_files/${rowId}`);

      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.fileUrl) {
        updateRow(rowId, { tiffPath: data.fileUrl, fileName: file.name, blobUrl });
        toast.success(`File saved to server: ${file.name}`);
      } else {
        toast.success(`Selected: ${file.name}`);
      }
    } catch {
      toast.success(`Selected: ${file.name}`);
    } finally {
      setRowUploading((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const creditAvailable = selectedCustomer ? (selectedCustomer.creditLimit || 0) - (selectedCustomer.usedCredit || 0) : 0;
  const hasAvailableCredit = selectedCustomer?.customerType === 'CREDIT' && creditAvailable > 0;
  const creditExceeded = paymentMethodTab === 'CREDIT' && summary.grandTotal > creditAvailable;

  const PAYMENT_OPTIONS = useMemo(() => [
    { id: 'HAND_CASH', label: 'CASH', tab: 'CASH_UPI' as const, key: 'c', description: 'Immediate Cash Settlement' },
    { id: 'UPI', label: 'UPI', tab: 'CASH_UPI' as const, key: 'u', description: 'Instant QR / UPI Transfer' },
    { id: 'BANK', label: 'BANK', tab: 'CASH_UPI' as const, key: 'b', description: 'Direct Bank / NEFT / RTGS' },
    { id: 'COD', label: 'COD', tab: 'CASH_UPI' as const, key: 'o', description: 'Cash / Payment on Delivery' },
    ...(hasAvailableCredit ? [
      { id: 'CREDIT', label: 'CREDIT ACCOUNT', tab: 'CREDIT' as const, key: 'r', description: 'Post-paid Ledger Credit' }
    ] : [])
  ], [hasAvailableCredit]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (logisticsDropdownOpen && !target.closest('#logistics-dropdown-container')) {
        setLogisticsDropdownOpen(false);
      }
      if (paymentDropdownOpen && !target.closest('#payment-dropdown-container')) {
        setPaymentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [logisticsDropdownOpen, paymentDropdownOpen]);

  useEffect(() => {
    const idx = LOGISTICS_OPTIONS.findIndex(o => o.id === deliveryType);
    if (idx !== -1) setHighlightLogisticsIndex(idx);
  }, [deliveryType, LOGISTICS_OPTIONS]);

  useEffect(() => {
    const idx = PAYMENT_OPTIONS.findIndex(o => o.id === paymentMode);
    if (idx !== -1) setHighlightPaymentIndex(idx);
  }, [paymentMode, PAYMENT_OPTIONS]);

  useEffect(() => {
    if (hasAvailableCredit) {
      setPaymentMethodTab('CREDIT');
      setPaymentMode('CREDIT');
    } else {
      setPaymentMethodTab('CASH_UPI');
      setPaymentMode('HAND_CASH');
    }
  }, [selectedCustomerId, hasAvailableCredit, setPaymentMode]);

  // Clear validation errors automatically when fields become valid
  useEffect(() => {
    if (selectedCustomerId) {
      setValidationErrors((prev) => {
        if (!prev['customer']) return prev;
        const next = { ...prev };
        delete next['customer'];
        return next;
      });
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (deliveryType === 'selfPickup' || (shippingAddress && shippingAddress.trim() && shippingAddress !== 'Self Pickup')) {
      setValidationErrors((prev) => {
        if (!prev['shippingAddress']) return prev;
        const next = { ...prev };
        delete next['shippingAddress'];
        return next;
      });
    }
  }, [shippingAddress, deliveryType]);

  useEffect(() => {
    if (selectedCustomerId && !hasAvailableCredit && paymentMode === 'CREDIT') {
      setPaymentMode('CASH');
    }
  }, [selectedCustomerId, hasAvailableCredit, setPaymentMode]);

  // Auto-focus Customer Selection box when Proxy Order page mounts
  useEffect(() => {
    const t = setTimeout(() => {
      const custInput = document.querySelector('input[placeholder="Search customer..."]') as HTMLInputElement;
      if (custInput) {
        custInput.focus();
      }
    }, 150);
    return () => clearTimeout(t);
  }, []);

  const [pendingFocusNewRow, setPendingFocusNewRow] = useState(false);

  useEffect(() => {
    if (pendingFocusNewRow && rows.length > 0) {
      const latestRow = rows[rows.length - 1];
      setPendingFocusNewRow(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${latestRow.id}-product-input`);
        if (el) {
          el.focus();
          setOpenRowId(latestRow.id);
          setSearchQuery('');
          setHighlightProductIndex(-1);
        }
      }, 60);
    }
  }, [rows.length, pendingFocusNewRow]);

  const handleEndOfList = (rowId: string) => {
    setOpenRowId(null);
    setSearchQuery('');
    // If this row is empty and we have at least one other row, remove it cleanly
    const r = rows.find((item: any) => item.id === rowId);
    if (r && !r.productId && rows.length > 1) {
      removeRow(rowId);
    }
    // Jump to next section (Payment Terminal in proxy order, or Special Notes/Submit in quotation)
    setTimeout(() => {
      if (vm.mode === 'quotation') {
        const nextEl = document.getElementById('quotation-notes')
          || document.getElementById('confirm-dimensions');
        if (nextEl) {
          nextEl.focus();
          nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        // Go to Logistics first, then Payment Terminal
        const logisticsBtn = document.getElementById('logistics-dropdown-btn');
        if (logisticsBtn) {
          logisticsBtn.focus();
          logisticsBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const nextEl = document.getElementById('payment-dropdown-btn')
            || document.getElementById('order-notes')
            || document.getElementById('confirm-dimensions');
          if (nextEl) {
            nextEl.focus();
            nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    }, 80);
  };

  const handleRowFinalEnter = (rowIndex: number) => {
    const isLastRow = rowIndex === rows.length - 1;
    if (isLastRow) {
      const currentRow = rows[rowIndex];
      if (currentRow && !currentRow.productId) {
        const el = document.getElementById(`row-${currentRow.id}-product-input`);
        if (el) {
          el.focus();
          setOpenRowId(currentRow.id);
          setSearchQuery('');
          setHighlightProductIndex(-1);
        }
        return;
      }
      setPendingFocusNewRow(true);
      addRow();
    } else {
      const nextRow = rows[rowIndex + 1];
      if (nextRow) {
        setTimeout(() => {
          const nextEl = document.getElementById(`row-${nextRow.id}-product-input`);
          if (nextEl) {
            nextEl.focus();
            setOpenRowId(nextRow.id);
            setSearchQuery('');
            setHighlightProductIndex(-1);
          }
        }, 50);
      }
    }
  };

  const validateAndSubmit = () => {
    const errors: Record<string, string> = {};

    // 1. Customer
    if (!selectedCustomerId) {
      errors['customer'] = 'Customer is required';
    }

    // 2. Order Items
    if (!rows || rows.length === 0) {
      errors['rows'] = 'At least one item is required';
    } else {
      // Clean up empty trailing rows if there are valid rows
      const hasAnyProduct = rows.some((r: any) => r.productId);
      if (hasAnyProduct && rows.some((r: any) => !r.productId)) {
        rows.filter((r: any) => !r.productId).forEach((r: any) => removeRow(r.id));
      }

      rows.forEach((row: any, idx: number) => {
        if (!row.productId) {
          errors[`row-${row.id}-product`] = `Item #${idx + 1}: Please select a product`;
          return;
        }

        const product = products.find((p: any) => p.id === row.productId);
        const rawUom = ((product as any)?.tally_uom || (product as any)?.unit_of_measure || row.unit || '').trim().toLowerCase();
        const cleanUom = rawUom.replace(/[\s\._-]/g, '');
        const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf')) : false;
        const currentMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
        const isModeB = currentMode === 'B';

        // Size fields
        if (hasMultipleSizes) {
          if (!row.width || Number(row.width) <= 0) {
            errors[`row-${row.id}-width`] = `Item #${idx + 1}: Width is required`;
          }
          if (!row.height || Number(row.height) <= 0) {
            errors[`row-${row.id}-height`] = `Item #${idx + 1}: Length is required`;
          }
          if (isModeB) {
            if (row.pcsNo !== undefined && (!row.pcsNo || Number(row.pcsNo) <= 0)) {
              errors[`row-${row.id}-pcs`] = `Item #${idx + 1}: Pcs/No must be at least 1`;
            }
          }
        } else {
          if (!row.quantity || Number(row.quantity) <= 0) {
            errors[`row-${row.id}-quantity`] = `Item #${idx + 1}: Quantity must be at least 1`;
          }
        }

        // Rate
        const baseRate = (row.manualRate !== undefined && row.manualRate !== '') ? Number(row.manualRate) || 0 : 0;
        if (baseRate <= 0) {
          errors[`row-${row.id}-rate`] = `Item #${idx + 1}: Rate is required`;
        }
      });
    }

    // 3. Delivery / Shipping address
    if (vm.mode !== 'quotation' && deliveryType !== 'selfPickup' && (!shippingAddress || shippingAddress === 'Self Pickup' || !shippingAddress.trim())) {
      errors['shippingAddress'] = 'Delivery address is required';
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstErrorKey = Object.keys(errors)[0];
      let element: HTMLElement | null = null;

      if (firstErrorKey === 'customer') {
        element = document.getElementById('proxy-customer-search-input') || document.getElementById('error-customer');
      } else if (firstErrorKey === 'rows') {
        element = document.getElementById(`row-${rows[0]?.id}-product-input`) || document.getElementById(`error-row-${rows[0]?.id}-product`);
      } else if (firstErrorKey.endsWith('-product')) {
        const rowId = firstErrorKey.replace('row-', '').replace('-product', '');
        element = document.getElementById(`row-${rowId}-product-input`) || document.getElementById(`error-${firstErrorKey}`);
      } else if (firstErrorKey.endsWith('-rate')) {
        const rowId = firstErrorKey.replace('row-', '').replace('-rate', '');
        element = document.getElementById(`error-row-${rowId}-rate`) || document.getElementById(`row-${rowId}-rate-unit`) || document.getElementById(`row-${rowId}-rate-sqft`);
      } else if (firstErrorKey === 'shippingAddress') {
        element = document.getElementById('error-shippingAddress') || document.getElementById('add-address-btn');
      } else {
        element = document.getElementById(`error-${firstErrorKey}`) || document.getElementById(firstErrorKey);
      }

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          const focusable = (element!.tagName === 'INPUT' || element!.tagName === 'SELECT' || element!.tagName === 'BUTTON' || element!.tagName === 'TEXTAREA')
            ? element!
            : element!.querySelector('input:not([type="hidden"]), select, textarea, button') as HTMLElement;
          if (focusable) {
            focusable.focus();
            if (focusable instanceof HTMLInputElement) {
              try {
                focusable.select();
              } catch {}
            }
          }
        }, 200);
      }

      const firstMsg = Object.values(errors)[0];
      toast.error(firstMsg || 'Please fill the missing fields highlighted in red.');
      return;
    }
    
    setShowConfirmOrderModal(true);
  };

  const [addressForm, setAddressForm] = useState({
    fullName: '', phone: '', pincode: '', state: '', stateCode: '', district: '', city: '', houseNo: '', roadName: '', area: '', addressType: 'Home'
  });

  useEffect(() => {
    if (showAddressModal) {
      setTimeout(() => {
        const houseNoInput = document.getElementById('modal-house-no') as HTMLInputElement;
        if (houseNoInput) {
          houseNoInput.focus();
        }
      }, 100);
    }
  }, [showAddressModal]);

  useEffect(() => {
    if (!bootstrapLoading) {
      const focusInitial = () => {
        const custInput = document.getElementById('proxy-customer-search-input') as HTMLInputElement;
        if (custInput) {
          custInput.focus();
        } else {
          const dateInput = document.getElementById('order-date-input') as HTMLInputElement;
          if (dateInput) dateInput.focus();
        }
      };
      focusInitial();
      const t1 = setTimeout(focusInitial, 60);
      const t2 = setTimeout(focusInitial, 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [bootstrapLoading]);

  const productImages = useMemo(() => {
    return rows
      .flatMap(r => {
        const p = products.find(prod => prod.id === r.productId);
        if (!p) return [];
        if (p.media?.images?.length) return p.media.images;
        if ((p as any).image) return [(p as any).image];
        return [];
      })
      .filter(Boolean) as string[];
  }, [rows, products]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [productImages.length]);

  useEffect(() => {
    if (productImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % productImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [productImages.length]);

  if (bootstrapLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-slate-500" size={40} />
      </div>
    );
  }

  const currentImage = productImages.length > 0 ? productImages[currentImageIndex % productImages.length] : null;

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="font-sans text-slate-800 p-3 md:p-4 pt-2 md:pt-3 relative z-10 min-h-screen rounded-none">
        <div className="w-full">
          
          {/* Moving Animated Light Pink & Light Blue Ambient Background */}
          <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#f1f6fd]">
            {/* Soft grid & noise texture */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#93c5fd_1.2px,transparent_1.2px)] [background-size:28px_28px] opacity-25"></div>
            
            {/* 1. Ultra Light Pink Orb - Moving from Left to Right Side */}
            <div className="animate-ambient-lr-1 absolute -top-[12%] -left-[10%] w-[70vw] h-[70vw] max-w-[950px] max-h-[950px] rounded-full bg-gradient-to-r from-pink-200/40 via-rose-100/30 to-pink-50/15 blur-[120px] pointer-events-none"></div>

            {/* 2. Light Blue Orb - Counter drift */}
            <div className="animate-ambient-rl-1 absolute -top-[15%] -right-[15%] w-[70vw] h-[70vw] max-w-[950px] max-h-[950px] rounded-full bg-gradient-to-l from-sky-200/45 via-blue-100/35 to-cyan-50/20 blur-[120px] pointer-events-none"></div>

            {/* 3. Light Blue / Cyan Orb - Bottom Left floating */}
            <div className="animate-ambient-rl-2 absolute -bottom-[15%] -left-[15%] w-[68vw] h-[68vw] max-w-[920px] max-h-[920px] rounded-full bg-gradient-to-tr from-cyan-200/40 via-blue-100/30 to-sky-50/20 blur-[120px] pointer-events-none"></div>

            {/* 4. Ultra Light Pink / Rose Orb - Bottom gliding Left to Right */}
            <div className="animate-ambient-lr-2 absolute -bottom-[12%] left-[10%] w-[65vw] h-[65vw] max-w-[880px] max-h-[880px] rounded-full bg-gradient-to-r from-pink-200/35 via-rose-100/25 to-transparent blur-[120px] pointer-events-none"></div>

            {/* 5. Center soft ambient aura drifting Left to Right */}
            <div className="animate-ambient-lr-1 absolute top-[20%] left-[15%] w-[60vw] h-[60vw] max-w-[820px] max-h-[820px] rounded-full bg-gradient-to-r from-pink-100/30 via-indigo-50/20 to-sky-100/35 blur-[140px] pointer-events-none"></div>
          </div>

          <div className="flex flex-col gap-4 pb-2">
            
            {/* Top Row: Image, Order # / Date, Customer */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-[180px_auto_1fr] xl:grid-cols-[200px_auto_1fr] items-stretch">
              {/* Image Card */}
              <div className="relative z-10 rounded-[2rem] bg-white/50 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center min-h-[120px]">
                <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white">
                  <img src={currentImage || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200'} className="absolute inset-0 w-full h-full object-cover" alt="Product preview" />
                </div>
              </div>

              {/* Order # & Date Card */}
              <div className="relative z-20 rounded-[2rem] bg-white/50 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight">
                      {vm.mode === 'quotation' ? 'Quote #' : 'Order #'}
                    </span>
                    <input
                      id="order-number-input"
                      type="text"
                      value={orderNumber}
                      readOnly
                      tabIndex={-1}
                      placeholder={vm.mode === 'quotation' ? 'QU-0001' : 'ORD-0001'}
                      className="h-10 w-28 bg-slate-50 text-slate-800 font-mono font-black text-xs px-3 rounded-xl border-2 border-slate-200 outline-none select-all cursor-default"
                      title={vm.mode === 'quotation' ? 'Quote # (Auto-generated)' : 'Order # (Auto-generated)'}
                    />
                  </div>

                  <div className="h-9 w-[1px] bg-slate-200 self-end mb-0.5" />

                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight flex items-center justify-between gap-1">
                      <span>Date</span>
                      <kbd className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 rounded">F2</kbd>
                    </span>
                    <input
                      id="order-date-input"
                      type="text"
                      inputMode="numeric"
                      value={dateDisplayInput}
                      onChange={(e) => setDateDisplayInput(e.target.value)}
                      onFocus={(e) => {
                        try {
                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                          e.currentTarget.setSelectionRange(len, len);
                        } catch {}
                      }}
                      onBlur={() => {
                        const parsed = parseTallyDate(dateDisplayInput, orderDate);
                        setOrderDate(parsed);
                        setDateDisplayInput(isoToDisplayDate(parsed));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const parsed = parseTallyDate(dateDisplayInput, orderDate);
                          setOrderDate(parsed);
                          setDateDisplayInput(isoToDisplayDate(parsed));
                          const custInput = document.getElementById('proxy-customer-search-input');
                          if (custInput) custInput.focus();
                        }
                      }}
                      placeholder="DD-MM-YYYY"
                      className="h-10 w-28 text-center bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-800 font-bold text-xs px-2 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all tabular-nums"
                      title={vm.mode === 'quotation' ? 'Quotation Date (Press F2)' : 'Order Date (Press F2)'}
                    />
                  </div>
                </div>
              </div>

              {/* Customer Card */}
              <div className="relative z-50 rounded-[2rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</h3>
                  <button onClick={() => setShowCreateCustomer(true)} className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700">
                    + New
                  </button>
                </div>
                
                <div className="relative">
                  <div id="error-customer" className={`flex h-10 w-full items-center rounded-xl px-3 transition-all duration-150 ${validationErrors['customer'] ? 'border-2 border-red-500 ring-4 ring-red-500/30 bg-red-50/50 shadow-md' : customerDropdownOpen ? 'border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md' : 'border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                      {customerSearching ? (
                        <Loader2 size={16} className="mr-2 animate-spin text-blue-600 shrink-0" />
                      ) : (
                        <Search size={16} className={`mr-2 transition-colors shrink-0 ${customerDropdownOpen ? 'text-blue-600' : 'text-slate-400'}`} />
                      )}
                      <input
                        id="proxy-customer-search-input"
                        autoFocus
                        value={customerSearch !== '' ? customerSearch : (selectedCustomer?.displayName || selectedCustomer?.name || '')}
                        placeholder="Search customer by name, phone, GSTIN..."
                        data-dropdown-open={customerDropdownOpen ? "true" : "false"}
                        onChange={(e) => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch(e.target.value);
                          setHighlightCustomerIndex(0);
                          if (e.target.value.trim()) {
                            setValidationErrors((prev) => {
                              if (!prev['customer']) return prev;
                              const next = { ...prev };
                              delete next['customer'];
                              return next;
                            });
                          }
                        }}
                        onFocus={(e) => {
                          setCustomerDropdownOpen(true);
                          const target = e.currentTarget;
                          if (selectedCustomer) {
                            setCustomerSearch(selectedCustomer.displayName || selectedCustomer.name || '');
                            setTimeout(() => {
                              try {
                                target.select();
                              } catch {}
                            }, 20);
                          } else {
                            setCustomerSearch('');
                          }
                          setHighlightCustomerIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "End") {
                            e.preventDefault();
                            const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                            e.currentTarget.setSelectionRange(len, len);
                            return;
                          } else if (e.key === "Home") {
                            e.preventDefault();
                            e.currentTarget.setSelectionRange(0, 0);
                            return;
                          } else if (e.key === "ArrowRight") {
                            const { selectionStart, selectionEnd, value } = e.currentTarget;
                            if (selectionStart !== selectionEnd) {
                              e.preventDefault();
                              const len = value ? value.length : 0;
                              e.currentTarget.setSelectionRange(len, len);
                              return;
                            }
                          } else if (e.key === "ArrowLeft") {
                            const { selectionStart, selectionEnd } = e.currentTarget;
                            if (selectionStart !== selectionEnd) {
                              e.preventDefault();
                              e.currentTarget.setSelectionRange(0, 0);
                              return;
                            }
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (!customerDropdownOpen) {
                              setCustomerDropdownOpen(true);
                              setHighlightCustomerIndex(0);
                              return;
                            }
                            setHighlightCustomerIndex((prev) => Math.min(prev + 1, sortedCustomers.length - 1));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightCustomerIndex((prev) => Math.max(prev - 1, 0));
                          } else if (e.key === "Enter") {
                            if (customerDropdownOpen && sortedCustomers.length > 0) {
                              e.preventDefault();
                              const customer = sortedCustomers[highlightCustomerIndex] || sortedCustomers[0];
                              if (customer) {
                                setSelectedCustomerId(customer.uid || customer.id);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch('');
                                setHighlightCustomerIndex(0);
                                const firstRowId = rows[0]?.id;
                                if (firstRowId) {
                                  setOpenRowId(firstRowId);
                                  setSearchQuery('');
                                }
                                const focusItem = () => {
                                  const firstProductInput = (firstRowId ? document.getElementById(`row-${firstRowId}-product-input`) : null)
                                    || (document.querySelector('input[placeholder="Select item..."]') as HTMLElement);
                                  if (firstProductInput) {
                                    firstProductInput.focus();
                                  }
                                };
                                focusItem();
                                requestAnimationFrame(focusItem);
                              }
                            } else if (selectedCustomer || selectedCustomerId) {
                              e.preventDefault();
                              setCustomerDropdownOpen(false);
                              const firstRowId = rows[0]?.id;
                              if (firstRowId) {
                                setOpenRowId(firstRowId);
                                setSearchQuery('');
                              }
                              const focusItem = () => {
                                const firstProductInput = (firstRowId ? document.getElementById(`row-${firstRowId}-product-input`) : null)
                                  || (document.querySelector('input[placeholder="Select item..."]') as HTMLElement);
                                if (firstProductInput) {
                                  firstProductInput.focus();
                                }
                              };
                              focusItem();
                              requestAnimationFrame(focusItem);
                            }
                          } else if (e.key === "Backspace") {
                            if (!customerSearch && !selectedCustomer) {
                              e.preventDefault();
                              setCustomerDropdownOpen(false);
                              const dateInput = document.getElementById('order-date-input');
                              if (dateInput) dateInput.focus();
                            } else if (customerSearch === '') {
                              e.preventDefault();
                              setCustomerDropdownOpen(false);
                              const dateInput = document.getElementById('order-date-input');
                              if (dateInput) dateInput.focus();
                            }
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setCustomerDropdownOpen(false);
                            setCustomerSearch('');
                          }, 200);
                        }}
                        className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder-slate-400"
                      />
                      <ChevronDown size={16} className={`ml-2 transition-colors shrink-0 ${customerDropdownOpen ? 'text-blue-600' : 'text-slate-400'}`} />
                    </div>
                  </div>
                  
                  {selectedCustomer && (
                    <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs font-medium text-slate-600 border border-slate-200">
                      {selectedCustomer.phone || 'No phone'} • {selectedCustomer.businessName || selectedCustomer.billing_city || 'Customer'}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Middle Row: Items Card (Full Width) */}
            <div className="w-full mb-2">
              {/* Items Card */}
              <div className="relative z-10 w-full rounded-[1.75rem] bg-white/50 p-3.5 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={addRow}
                    className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="flex-1 overflow-visible">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="py-1.5 px-1.5 w-8 text-center">#</th>
                        <th className="py-1.5 px-2 min-w-[220px] text-left">Name of Item</th>
                        <th className="py-1.5 px-1 w-[88px] text-center">HSN Code</th>
                        <th className="py-1.5 px-1 w-[55px] text-center">GST %</th>
                        <th className="py-1.5 px-1 w-[45px] text-center">T</th>
                        <th className="py-1.5 px-1 w-[95px] text-center">Width</th>
                        <th className="py-1.5 px-1 w-[95px] text-center">Length</th>
                        <th className="py-1.5 px-1 w-[75px] text-center">Sq. Ft.</th>
                        <th className="py-1.5 px-1 w-[70px] text-center">Pcs/No</th>
                        <th className="py-1.5 px-1 w-[105px] text-center">Quantity</th>
                        <th className="py-1.5 px-1 w-[90px] text-center">Rate/SqFt</th>
                        <th className="py-1.5 px-1 w-[105px] text-center">Rate per</th>
                        <th className="py-1.5 px-1 w-[90px] text-center">Finish</th>
                        <th className="py-1.5 px-2 min-w-[210px] text-left">File Path <span className="normal-case font-normal text-slate-400 tracking-normal italic">(optional)</span></th>
                        <th className="py-1.5 px-2 w-[95px] text-right">Amount</th>
                        <th className="py-1.5 px-1 w-9 text-center">×</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row: any, index: number) => {
                        const product = products.find((item: any) => item.id === row.productId);
                        const rawUom = ((product as any)?.tally_uom || (product as any)?.unit_of_measure || row.unit || '').trim().toLowerCase();
                        const cleanUom = rawUom.replace(/[\s\._-]/g, '');
                        // If product has multiple size details explicitly set in Tally (or UOM is sqft)
                        const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf')) : false;
                        const isSqft = hasMultipleSizes;
                        const isDirect = !isSqft;
                        const currentMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
                        const isModeA = currentMode === 'A';
                        const isModeB = currentMode === 'B';
                        const isSqftModeB = hasMultipleSizes && isModeB;
                        const displayUnit = (product as any)?.tally_uom || (product as any)?.unit_of_measure || row.unit || 'N';
                        const w = Number(row.width !== undefined && row.width !== '' ? row.width : (hasMultipleSizes ? (product?.default_width || 1) : 0)) || 0;
                        const h = Number(row.height !== undefined && row.height !== '' ? row.height : (hasMultipleSizes ? (product?.default_length || 1) : 0)) || 0;
                        const wFt = row.widthUnit === 'IN' ? w / 12 : (row.widthUnit === 'MTR' ? w * 3.28084 : w);
                        const hFt = row.heightUnit === 'IN' ? h / 12 : (row.heightUnit === 'MTR' ? h * 3.28084 : h);
                        const sqft = hasMultipleSizes ? ((wFt > 0 && hFt > 0) ? (wFt * hFt) : 0) : 0;
                        const pcs = Math.max(1, Number(row.pcsNo || '1'));
                        const totalBilledSqft = sqft * pcs;
                        const baseRate = row.manualRate !== undefined && row.manualRate !== '' ? Number(row.manualRate) || 0 : 0;
                        const eyeletRate = (row.eyeletType === 'METAL' ? product?.eyeletPricing?.metal || 0 : row.eyeletType === 'PLASTIC' ? product?.eyeletPricing?.plastic || 0 : 0);
                        
                        // If not multiple size (isDirect): Standard Quantity * Rate per
                        // If multiple size & Mode A: Rate per = SqFt * Rate/SqFt, Quantity is user entered
                        // If multiple size & Mode B: Quantity = SqFt * Pcs, Rate per is Rate/SqFt
                        const qtyNum = Number(row.quantity !== undefined && row.quantity !== '' ? row.quantity : (isDirect ? 1 : (isModeB ? totalBilledSqft : 1))) || 1;
                        const calculatedRatePerUnit = isDirect ? baseRate : (isModeA ? (sqft * baseRate) : baseRate);
                        const amount = isDirect
                          ? Number((qtyNum * baseRate + (row.eyeletType !== 'NONE' ? eyeletRate : 0)).toFixed(2))
                          : (isModeA
                              ? Number((qtyNum * calculatedRatePerUnit + (row.eyeletType !== 'NONE' ? eyeletRate : 0)).toFixed(2))
                              : Number((totalBilledSqft * baseRate + (row.eyeletType !== 'NONE' ? eyeletRate * pcs : 0)).toFixed(2)));
                        const gstRate = product?.gst_rate || 18;

                        return (
                          <tr key={row.id} className="group transition-colors hover:bg-slate-50/50 align-top">
                            <td className="py-1 px-1.5 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-400">
                                {index + 1}
                              </div>
                            </td>
                            <td className="py-1 px-2 tabular-nums align-top">
                              {(() => {
                                  const selProd = products.find((p: any) => p.id === row.productId);
                                  const isOpen = openRowId === row.id && !activeDescRowId;
                                  const displayedItems = matchedProducts;

                                  return (
                                    <div className="space-y-1 min-w-[220px]">
                                      <div id={`error-row-${row.id}-product`} className="relative w-full">
                                      <div className={`flex h-10 w-full items-center rounded-lg px-3 transition-all duration-150 ${validationErrors[`row-${row.id}-product`] ? 'border-2 border-red-500 ring-4 ring-red-500/30 bg-red-50/50 shadow-md' : isOpen ? 'border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-sm' : activeDescRowId ? 'border-2 border-slate-200 bg-slate-50' : 'border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                                         <input
                                           id={`row-${row.id}-product-input`}
                                           value={isOpen ? searchQuery : (selProd?.name ?? '')}
                                           placeholder="Select item..."
                                           data-dropdown-open={isOpen ? "true" : "false"}
                                           onChange={(e) => {
                                             setOpenRowId(row.id);
                                             setSearchQuery(e.target.value);
                                             setHighlightProductIndex(0);
                                           }}
                                           onFocus={(e) => {
                                             setOpenRowId(row.id);
                                             const currentName = selProd?.name || '';
                                             setSearchQuery(currentName);
                                             
                                             // Find index in displayed grouped list
                                             const currIdx = displayedItems.findIndex((p: any) => p.id === row.productId);
                                             setHighlightProductIndex(currIdx >= 0 ? currIdx : (!currentName ? -1 : 0));

                                             const inputEl = e.currentTarget;
                                             setTimeout(() => {
                                               try {
                                                 const len = inputEl.value ? inputEl.value.length : 0;
                                                 inputEl.setSelectionRange(len, len);
                                               } catch {}
                                             }, 10);
                                           }}
                                           onKeyDown={(e) => {
                                             if (e.key === "ArrowDown") {
                                               e.preventDefault();
                                               if (!isOpen) {
                                                 setOpenRowId(row.id);
                                                 const currIdx = displayedItems.findIndex((p: any) => p.id === row.productId);
                                                 setHighlightProductIndex(currIdx >= 0 ? currIdx : 0);
                                                 return;
                                               }
                                               setHighlightProductIndex((prev) => (prev === -1 ? 0 : Math.min(prev + 1, displayedItems.length - 1)));
                                             } else if (e.key === "ArrowUp") {
                                               e.preventDefault();
                                               setHighlightProductIndex((prev) => {
                                                 if (prev <= 0 && !searchQuery.trim()) return -1;
                                                 return Math.max(prev - 1, 0);
                                               });
                                             } else if (e.key === " " && !searchQuery.trim() && isOpen && displayedItems.length > 0 && highlightProductIndex >= 0) {
                                               // Spacebar selection like Tally
                                               e.preventDefault();
                                               const p = displayedItems[highlightProductIndex];
                                               if (p) {
                                                 const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || 'B';
                                                 updateRow(row.id, { productId: p.id, billingMode: prodMode });
                                                 setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-product`]; return n; });
                                                 setOpenRowId(null);
                                                 setSearchQuery('');
                                                 setHighlightProductIndex(0);
                                                 setTimeout(() => {
                                                   setActiveDescRowId(row.id);
                                                 }, 60);
                                               }
                                             } else if (e.key === "Enter") {
                                               e.preventDefault();
                                               // 1. End of List if explicitly highlighting "End of List" (-1)
                                               if (highlightProductIndex === -1) {
                                                 handleEndOfList(row.id);
                                                 return;
                                               }
                                               // 2. If dropdown is open and an item is selected/highlighted
                                               if (isOpen && displayedItems.length > 0 && highlightProductIndex >= 0) {
                                                 const p = displayedItems[highlightProductIndex];
                                                 if (p) {
                                                   const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || 'B';
                                                   updateRow(row.id, { productId: p.id, billingMode: prodMode });
                                                   setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-product`]; return n; });
                                                   setOpenRowId(null);
                                                   setSearchQuery('');
                                                   setHighlightProductIndex(0);
                                                   setTimeout(() => {
                                                     setActiveDescRowId(row.id);
                                                   }, 60);
                                                   return;
                                                 }
                                               }
                                               // 3. If item is already selected on this row, keep it and advance to description modal
                                               if (row.productId) {
                                                 setOpenRowId(null);
                                                 setTimeout(() => {
                                                   setActiveDescRowId(row.id);
                                                 }, 60);
                                                 return;
                                               }
                                               // 4. If search matches any product, select first product and advance
                                               if (displayedItems.length > 0) {
                                                 const p = displayedItems[0];
                                                 const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || 'B';
                                                 updateRow(row.id, { productId: p.id, billingMode: prodMode });
                                                 setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-product`]; return n; });
                                                 setOpenRowId(null);
                                                 setSearchQuery('');
                                                 setHighlightProductIndex(0);
                                                 setTimeout(() => {
                                                   setActiveDescRowId(row.id);
                                                 }, 60);
                                                 return;
                                               }
                                               // 5. Fallback
                                               handleEndOfList(row.id);
                                             } else if (e.key === "Backspace") {
                                               const isFullSelected = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === e.currentTarget.value.length;
                                               if (!searchQuery.trim() || !row.productId || isFullSelected) {
                                                 if (!searchQuery.trim() || isFullSelected) {
                                                   e.preventDefault();
                                                   setOpenRowId(null);
                                                   if (index === 0) {
                                                     const custInput = document.getElementById('proxy-customer-search-input') || document.getElementById('order-number-input');
                                                     if (custInput) {
                                                       custInput.focus();
                                                       try {
                                                         const len = (custInput as HTMLInputElement).value ? (custInput as HTMLInputElement).value.length : 0;
                                                         (custInput as HTMLInputElement).setSelectionRange(len, len);
                                                       } catch {}
                                                     }
                                                   } else {
                                                     const prevRow = rows[index - 1];
                                                     if (prevRow) {
                                                       const prevTarget = document.getElementById(`row-${prevRow.id}-delete-btn`)
                                                         || document.getElementById(`row-${prevRow.id}-browse-btn`)
                                                         || document.getElementById(`error-row-${prevRow.id}-file`);
                                                       if (prevTarget) prevTarget.focus();
                                                     }
                                                   }
                                                 }
                                               }
                                             } else if (e.key === "Escape") {
                                               setOpenRowId(null);
                                             }
                                           }}
                                           onBlur={() => setTimeout(() => { setOpenRowId(null); setSearchQuery(''); }, 200)}
                                           className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                         />
                                         <ChevronDown
                                           size={14}
                                           className={`cursor-pointer transition-colors ${isOpen ? 'text-blue-600' : 'text-slate-400'}`}
                                           onClick={() => {
                                             if (isOpen) {
                                               setOpenRowId(null);
                                             } else {
                                               setOpenRowId(row.id);
                                               const currentName = selProd?.name || '';
                                               setSearchQuery(currentName);
                                               const currIdx = displayedItems.findIndex((p: any) => p.id === row.productId);
                                               setHighlightProductIndex(currIdx >= 0 ? currIdx : (!currentName ? -1 : 0));
                                             }
                                           }}
                                         />
                                       </div>
                                      </div>
                                     <div className="flex items-center gap-1.5 pt-0.5">
                                       <span className="text-[10px] font-bold text-slate-400 select-none pl-1" title="Tally Additional Description">↳</span>
                                       <input
                                         id={`row-${row.id}-description`}
                                         value={row.description !== undefined ? row.description : (row.projectName || '')}
                                         readOnly
                                         tabIndex={-1}
                                         onClick={() => {
                                           setOpenRowId(null);
                                           setActiveDescRowId(row.id);
                                         }}
                                         placeholder="Description / notes (optional)..."
                                         className="h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2 text-[11px] font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs cursor-pointer truncate"
                                         title="Additional Description for stock item (like Tally Prime) — Opens description window"
                                       />
                                     </div>
                                    </div>
                                  );
                                })()}
                            </td>
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-500">
                                {product?.hsn || product?.hsn_code || row.hsnCode || '—'}
                              </div>
                            </td>
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-600">
                                {gstRate}%
                              </div>
                            </td>
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                <span
                                  id={`row-${row.id}-mode-btn`}
                                  tabIndex={-1}
                                  title={`Mode ${currentMode} — Locked to Tally master (cannot be changed)`}
                                  className={`h-10 min-w-[36px] px-2.5 rounded-lg border-2 font-black text-xs inline-flex items-center justify-center gap-1 shadow-sm select-none cursor-not-allowed outline-none ${
                                    currentMode === 'A'
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-emerald-600 bg-emerald-600 text-white'
                                  }`}
                                >
                                  <span className="text-sm font-extrabold">{currentMode}</span>
                                </span>
                              </div>
                            </td>
                            {/* Width Column */}
                            <td className="py-1 px-1 tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                {!hasMultipleSizes ? (
                                  <div className="h-10 w-[90px] flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-lg font-bold">—</div>
                                ) : (
                                  <div className={`flex h-10 w-[90px] items-center rounded-lg border-2 px-1 overflow-visible transition-all ${validationErrors[`row-${row.id}-width`] ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50' : 'border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                                    <input
                                      id={`error-row-${row.id}-width`}
                                      value={row.width !== undefined ? row.width : (product?.default_width || '1')}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRow(row.id, { width: val });
                                        if (Number(val) > 0) {
                                          setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-width`]; return n; });
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          const widthUnitBtn = document.getElementById(`row-${row.id}-width-unit`);
                                          if (widthUnitBtn) widthUnitBtn.focus();
                                          else {
                                            const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                            if (heightInput) {
                                              heightInput.focus();
                                            }
                                          }
                                        } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setOpenRowId(row.id);
                                          const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                          if (itemInput) {
                                            itemInput.focus();
                                          }
                                        }
                                      }}
                                      className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 transition-all ${validationErrors[`row-${row.id}-width`] ? 'text-red-600 placeholder-red-300' : ''}`}
                                      placeholder="W"
                                    />
                                    <div className="relative flex-shrink-0">
                                      <button
                                        id={`row-${row.id}-width-unit`}
                                        type="button"
                                        onClick={() => setOpenUnitPickerId(openUnitPickerId === `${row.id}-w` ? null : `${row.id}-w`)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            setOpenUnitPickerId(null);
                                            const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                            if (heightInput) {
                                              heightInput.focus();
                                            }
                                          } else if (e.key === " " || e.key === "Spacebar") {
                                            e.preventDefault();
                                            const nextUnit = row.widthUnit === 'FT' ? 'IN' : row.widthUnit === 'IN' ? 'MTR' : 'FT';
                                            updateRow(row.id, { widthUnit: nextUnit });
                                          } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
                                            e.preventDefault();
                                            setOpenUnitPickerId(null);
                                            const widthInput = document.getElementById(`error-row-${row.id}-width`);
                                            if (widthInput) {
                                              widthInput.focus();
                                            }
                                          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            const nextUnit = row.widthUnit === 'FT' ? 'IN' : row.widthUnit === 'IN' ? 'MTR' : 'FT';
                                            updateRow(row.id, { widthUnit: nextUnit });
                                          }
                                        }}
                                        onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                                        className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                                      >
                                        {row.widthUnit === 'FT' ? 'ft' : row.widthUnit === 'IN' ? 'in' : 'm'}
                                        <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                                      </button>
                                      {openUnitPickerId === `${row.id}-w` && (
                                        <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                          {['FT', 'IN', 'MTR'].map(u => (
                                            <button
                                              key={u}
                                              type="button"
                                              tabIndex={-1}
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                updateRow(row.id, { widthUnit: u });
                                                setOpenUnitPickerId(null);
                                                setTimeout(() => {
                                                  const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                                  if (heightInput) {
                                                    heightInput.focus();
                                                  }
                                                }, 50);
                                              }}
                                              className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                                                row.widthUnit === u
                                                  ? 'bg-blue-600 text-white'
                                                  : 'text-slate-600 hover:bg-slate-50'
                                              }`}
                                            >
                                              {u === 'MTR' ? 'm' : u.toLowerCase()}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Length Column */}
                            <td className="py-1 px-1 tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                {!hasMultipleSizes ? (
                                  <div className="h-10 w-[90px] flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-lg font-bold">—</div>
                                ) : (
                                  <div className={`flex h-10 w-[90px] items-center rounded-lg border-2 px-1 overflow-visible transition-all ${validationErrors[`row-${row.id}-height`] ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50' : 'border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                                    <input
                                      id={`error-row-${row.id}-height`}
                                      value={row.height !== undefined ? row.height : (product?.default_length || '1')}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRow(row.id, { height: val });
                                        if (Number(val) > 0) {
                                          setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-height`]; return n; });
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "End") {
                                          e.preventDefault();
                                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                          e.currentTarget.setSelectionRange(len, len);
                                        } else if (e.key === "Home") {
                                          e.preventDefault();
                                          e.currentTarget.setSelectionRange(0, 0);
                                        } else if (e.key === "Enter") {
                                          e.preventDefault();
                                          const heightUnitBtn = document.getElementById(`row-${row.id}-height-unit`);
                                          if (heightUnitBtn) heightUnitBtn.focus();
                                          else if (isModeB) {
                                            const pcsInput = document.getElementById(`error-row-${row.id}-pcs`);
                                            if (pcsInput) {
                                              pcsInput.focus();
                                            }
                                          } else {
                                            const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                            if (qtyInput) {
                                              qtyInput.focus();
                                              try {
                                                const len = (qtyInput as HTMLInputElement).value ? (qtyInput as HTMLInputElement).value.length : 0;
                                                (qtyInput as HTMLInputElement).setSelectionRange(len, len);
                                              } catch {}
                                            }
                                          }
                                        } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                          e.preventDefault();
                                          const widthUnitBtn = document.getElementById(`row-${row.id}-width-unit`);
                                          if (widthUnitBtn) widthUnitBtn.focus();
                                          else {
                                            const widthInput = document.getElementById(`error-row-${row.id}-width`);
                                            if (widthInput) {
                                              widthInput.focus();
                                            }
                                          }
                                        }
                                      }}
                                      className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 transition-all ${validationErrors[`row-${row.id}-height`] ? 'text-red-600 placeholder-red-300' : ''}`}
                                      placeholder="L"
                                    />
                                    <div className="relative flex-shrink-0">
                                      <button
                                        id={`row-${row.id}-height-unit`}
                                        type="button"
                                        onClick={() => setOpenUnitPickerId(openUnitPickerId === `${row.id}-h` ? null : `${row.id}-h`)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            setOpenUnitPickerId(null);
                                            if (isModeB) {
                                              const pcsInput = document.getElementById(`error-row-${row.id}-pcs`);
                                              if (pcsInput) {
                                                pcsInput.focus();
                                              }
                                            } else {
                                              const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                              if (qtyInput) {
                                                qtyInput.focus();
                                                try {
                                                  const len = (qtyInput as HTMLInputElement).value ? (qtyInput as HTMLInputElement).value.length : 0;
                                                  (qtyInput as HTMLInputElement).setSelectionRange(len, len);
                                                } catch {}
                                              }
                                            }
                                          } else if (e.key === " " || e.key === "Spacebar") {
                                            e.preventDefault();
                                            const nextUnit = row.heightUnit === 'FT' ? 'IN' : row.heightUnit === 'IN' ? 'MTR' : 'FT';
                                            updateRow(row.id, { heightUnit: nextUnit });
                                          } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
                                            e.preventDefault();
                                            setOpenUnitPickerId(null);
                                            const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                            if (heightInput) {
                                              heightInput.focus();
                                            }
                                          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                            e.preventDefault();
                                            const nextUnit = row.heightUnit === 'FT' ? 'IN' : row.heightUnit === 'IN' ? 'MTR' : 'FT';
                                            updateRow(row.id, { heightUnit: nextUnit });
                                          }
                                        }}
                                        onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                                        className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                                      >
                                        {row.heightUnit === 'FT' ? 'ft' : row.heightUnit === 'IN' ? 'in' : 'm'}
                                        <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                                      </button>
                                      {openUnitPickerId === `${row.id}-h` && (
                                        <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                          {['FT', 'IN', 'MTR'].map(u => (
                                            <button
                                              key={u}
                                              type="button"
                                              tabIndex={-1}
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                updateRow(row.id, { heightUnit: u });
                                                setOpenUnitPickerId(null);
                                                setTimeout(() => {
                                                  if (isModeB) {
                                                    const pcsInput = document.getElementById(`error-row-${row.id}-pcs`);
                                                    if (pcsInput) {
                                                      pcsInput.focus();
                                                    }
                                                  } else {
                                                    const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                                    if (qtyInput) {
                                                      qtyInput.focus();
                                                      try {
                                                        const len = (qtyInput as HTMLInputElement).value ? (qtyInput as HTMLInputElement).value.length : 0;
                                                        (qtyInput as HTMLInputElement).setSelectionRange(len, len);
                                                      } catch {}
                                                    }
                                                  }
                                                }, 50);
                                              }}
                                              className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                                                row.heightUnit === u
                                                  ? 'bg-blue-600 text-white'
                                                  : 'text-slate-600 hover:bg-slate-50'
                                              }`}
                                            >
                                              {u === 'MTR' ? 'm' : u.toLowerCase()}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Sq. Ft. Column */}
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-700">
                                {sqft > 0 ? sqft.toFixed(2) : '—'}
                              </div>
                            </td>
                            {/* Pcs/No Column */}
                            <td className="py-1 px-1 tabular-nums text-center align-top">
                              <div className="h-10 flex items-center justify-center">
                                {hasMultipleSizes && isModeB ? (
                                  <input
                                    id={`error-row-${row.id}-pcs`}
                                    value={row.pcsNo ?? '1'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateRow(row.id, { pcsNo: val });
                                      if (Number(val) > 0) {
                                        setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-pcs`]; return n; });
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "End") {
                                        e.preventDefault();
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } else if (e.key === "Home") {
                                        e.preventDefault();
                                        e.currentTarget.setSelectionRange(0, 0);
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        const rateInput = document.getElementById(`row-${row.id}-rate-unit`);
                                        if (rateInput) {
                                          rateInput.focus();
                                        }
                                      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                        e.preventDefault();
                                        const heightUnitBtn = document.getElementById(`row-${row.id}-height-unit`);
                                        if (heightUnitBtn) heightUnitBtn.focus();
                                        else {
                                          const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                          if (heightInput) {
                                            heightInput.focus();
                                          }
                                        }
                                      }
                                    }}
                                    className={`h-10 w-14 rounded-lg border-2 text-center text-xs font-bold outline-none transition-all ${
                                      validationErrors[`row-${row.id}-pcs`]
                                        ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50 text-red-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white'
                                    }`}
                                    placeholder="Pcs"
                                  />
                                ) : (
                                  <div className="h-10 flex items-center justify-center text-slate-300 font-bold">—</div>
                                )}
                              </div>
                            </td>
                            {/* Quantity Column */}
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center text-xs font-bold">
                                {hasMultipleSizes && isModeB ? (
                                  <span className="text-slate-800 font-bold">{totalBilledSqft > 0 ? `${totalBilledSqft.toFixed(3)} sqft` : '—'}</span>
                                ) : (
                                  <div className="inline-flex items-center justify-center gap-1">
                                    <input
                                      id={`error-row-${row.id}-quantity`}
                                      value={row.quantity !== undefined ? row.quantity : '1'}
                                      onFocus={(e) => {
                                        try {
                                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                          e.currentTarget.setSelectionRange(len, len);
                                        } catch {}
                                      }}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRow(row.id, { quantity: val });
                                        if (Number(val) > 0) {
                                          setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-quantity`]; return n; });
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "End") {
                                          e.preventDefault();
                                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                          e.currentTarget.setSelectionRange(len, len);
                                        } else if (e.key === "Home") {
                                          e.preventDefault();
                                          e.currentTarget.setSelectionRange(0, 0);
                                        } else if (e.key === "Enter") {
                                          e.preventDefault();
                                          const rateInput = document.getElementById(`row-${row.id}-rate-sqft`);
                                          if (rateInput) {
                                            rateInput.focus();
                                            try {
                                              const len = (rateInput as HTMLInputElement).value ? (rateInput as HTMLInputElement).value.length : 0;
                                              (rateInput as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else {
                                            const rateUnit = document.getElementById(`row-${row.id}-rate-unit`);
                                            if (rateUnit) {
                                              rateUnit.focus();
                                              try {
                                                const len = (rateUnit as HTMLInputElement).value ? (rateUnit as HTMLInputElement).value.length : 0;
                                                (rateUnit as HTMLInputElement).setSelectionRange(len, len);
                                              } catch {}
                                            } else {
                                              const finishSelect = document.getElementById(`row-${row.id}-finish-select`);
                                              if (finishSelect) finishSelect.focus();
                                              else {
                                                const fileInput = document.getElementById(`error-row-${row.id}-file`);
                                                if (fileInput) {
                                                  fileInput.focus();
                                                  try {
                                                    const len = (fileInput as HTMLInputElement).value ? (fileInput as HTMLInputElement).value.length : 0;
                                                    (fileInput as HTMLInputElement).setSelectionRange(len, len);
                                                  } catch {}
                                                }
                                              }
                                            }
                                          }
                                        } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (hasMultipleSizes) {
                                            const heightUnitBtn = document.getElementById(`row-${row.id}-height-unit`);
                                            if (heightUnitBtn) heightUnitBtn.focus();
                                            else {
                                              const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                              if (heightInput) {
                                                heightInput.focus();
                                                try {
                                                  const len = (heightInput as HTMLInputElement).value ? (heightInput as HTMLInputElement).value.length : 0;
                                                  (heightInput as HTMLInputElement).setSelectionRange(len, len);
                                                } catch {}
                                              }
                                            }
                                          } else {
                                            setOpenRowId(row.id);
                                            const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                            if (itemInput) {
                                              itemInput.focus();
                                              try {
                                                const len = (itemInput as HTMLInputElement).value ? (itemInput as HTMLInputElement).value.length : 0;
                                                (itemInput as HTMLInputElement).setSelectionRange(len, len);
                                              } catch {}
                                            }
                                          }
                                        }
                                      }}
                                      className={`h-10 w-14 rounded-lg border-2 text-center text-xs font-bold transition-all ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white'}`}
                                      placeholder="Qty"
                                    />
                                    <span className="text-[11px] font-black text-slate-500">{displayUnit}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Rate/SqFt Column — EDITABLE only in Mode A with Multiple Sizes */}
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                {hasMultipleSizes && isModeA ? (
                                  <input
                                    id={`row-${row.id}-rate-sqft`}
                                    value={row.manualRate !== undefined ? row.manualRate : ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateRow(row.id, { manualRate: val });
                                      if (Number(val) > 0) {
                                        setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-rate`]; return n; });
                                      }
                                    }}
                                    onFocus={(e) => {
                                      try {
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } catch {}
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "End") {
                                        e.preventDefault();
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } else if (e.key === "Home") {
                                        e.preventDefault();
                                        e.currentTarget.setSelectionRange(0, 0);
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        const finishSelect = document.getElementById(`row-${row.id}-finish-select`);
                                        if (finishSelect && !isDirect) {
                                          finishSelect.focus();
                                        } else {
                                          const fileInput = document.getElementById(`error-row-${row.id}-file`);
                                          if (fileInput) {
                                            fileInput.focus();
                                            try {
                                              const len = (fileInput as HTMLInputElement).value ? (fileInput as HTMLInputElement).value.length : 0;
                                              (fileInput as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else {
                                            handleRowFinalEnter(index);
                                          }
                                        }
                                      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                        e.preventDefault();
                                        const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                        if (qtyInput) {
                                          qtyInput.focus();
                                          try {
                                            const len = (qtyInput as HTMLInputElement).value ? (qtyInput as HTMLInputElement).value.length : 0;
                                            (qtyInput as HTMLInputElement).setSelectionRange(len, len);
                                          } catch {}
                                        }
                                      }
                                    }}
                                    placeholder="0.00"
                                    className={`h-10 w-18 rounded-lg border-2 text-center text-xs font-bold outline-none transition-all tabular-nums ${
                                      validationErrors[`row-${row.id}-rate`]
                                        ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50 text-red-700'
                                        : 'border-blue-300 bg-blue-50 text-blue-800 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/30 focus:bg-white'
                                    }`}
                                    title="Rate per sq.ft in Mode A — editable (like Tally)"
                                  />
                                ) : (
                                  <div className="h-10 flex items-center justify-center text-slate-300 font-bold">—</div>
                                )}
                              </div>
                            </td>
                            {/* Rate per (unit) Column — In Mode A: Shows Sq.Ft * Rate/SqFt. In Mode B & Direct: Editable */}
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                {hasMultipleSizes && isModeA ? (
                                  <span className="inline-flex items-center gap-1 text-blue-900 font-bold text-xs bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
                                    {calculatedRatePerUnit.toFixed(2)}
                                    <span className="text-[10px] text-blue-500 font-bold">{displayUnit}</span>
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center justify-center gap-1">
                                    <input
                                      id={`row-${row.id}-rate-unit`}
                                      value={row.manualRate !== undefined ? row.manualRate : ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRow(row.id, { manualRate: val });
                                        if (Number(val) > 0) {
                                          setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${row.id}-rate`]; return n; });
                                        }
                                      }}
                                      onFocus={(e) => {
                                        try {
                                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                          e.currentTarget.setSelectionRange(len, len);
                                        } catch {}
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "End") {
                                          e.preventDefault();
                                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                          e.currentTarget.setSelectionRange(len, len);
                                        } else if (e.key === "Home") {
                                          e.preventDefault();
                                          e.currentTarget.setSelectionRange(0, 0);
                                        } else if (e.key === "Enter") {
                                          e.preventDefault();
                                          const finishSelect = document.getElementById(`row-${row.id}-finish-select`);
                                          if (finishSelect && !isDirect) {
                                            finishSelect.focus();
                                          } else {
                                            const fileInput = document.getElementById(`error-row-${row.id}-file`);
                                            if (fileInput) {
                                              fileInput.focus();
                                              try {
                                                const len = (fileInput as HTMLInputElement).value ? (fileInput as HTMLInputElement).value.length : 0;
                                                (fileInput as HTMLInputElement).setSelectionRange(len, len);
                                              } catch {}
                                            } else {
                                              handleRowFinalEnter(index);
                                            }
                                          }
                                        } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                          e.preventDefault();
                                          if (hasMultipleSizes && isModeB) {
                                            const pcsInput = document.getElementById(`error-row-${row.id}-pcs`);
                                            if (pcsInput) {
                                              pcsInput.focus();
                                              try {
                                                const len = (pcsInput as HTMLInputElement).value ? (pcsInput as HTMLInputElement).value.length : 0;
                                                (pcsInput as HTMLInputElement).setSelectionRange(len, len);
                                              } catch {}
                                              return;
                                            }
                                          }
                                          const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                          if (qtyInput) {
                                            qtyInput.focus();
                                            try {
                                              const len = (qtyInput as HTMLInputElement).value ? (qtyInput as HTMLInputElement).value.length : 0;
                                              (qtyInput as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else {
                                            const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                            if (itemInput) itemInput.focus();
                                          }
                                        }
                                      }}
                                      placeholder="0.00"
                                      className={`h-10 w-18 rounded-lg border-2 text-center text-xs font-bold outline-none transition-all tabular-nums ${
                                        validationErrors[`row-${row.id}-rate`]
                                          ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50 text-red-700'
                                          : 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/30 focus:bg-white'
                                      }`}
                                      title="Rate per unit in Mode B — editable (like Tally)"
                                    />
                                    <span className="text-[10px] text-slate-500 font-bold">{displayUnit}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Finish Column */}
                            <td className="py-1 px-1 text-center tabular-nums align-top">
                              <div className="h-10 flex items-center justify-center">
                                {isDirect ? (
                                  <div className="h-10 w-full min-w-[76px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                    —
                                  </div>
                                ) : (
                                  <div className="relative w-full min-w-[76px]">
                                    <select
                                      id={`row-${row.id}-finish-select`}
                                      value={row.eyeletType || "NONE"}
                                      onChange={(e) => updateRow(row.id, { eyeletType: e.target.value as any })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          const fileInput = document.getElementById(`error-row-${row.id}-file`);
                                          if (fileInput) {
                                            fileInput.focus();
                                            try {
                                              const len = (fileInput as HTMLInputElement).value ? (fileInput as HTMLInputElement).value.length : 0;
                                              (fileInput as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else {
                                            const browseBtn = document.getElementById(`row-${row.id}-browse-btn`);
                                            if (browseBtn) browseBtn.focus();
                                            else handleRowFinalEnter(index);
                                          }
                                        } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
                                          e.preventDefault();
                                          const rateSqft = document.getElementById(`row-${row.id}-rate-sqft`);
                                          const rateUnit = document.getElementById(`row-${row.id}-rate-unit`);
                                          if (rateSqft && hasMultipleSizes && isModeA) {
                                            rateSqft.focus();
                                            try {
                                              const len = (rateSqft as HTMLInputElement).value ? (rateSqft as HTMLInputElement).value.length : 0;
                                              (rateSqft as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else if (rateUnit) {
                                            rateUnit.focus();
                                            try {
                                              const len = (rateUnit as HTMLInputElement).value ? (rateUnit as HTMLInputElement).value.length : 0;
                                              (rateUnit as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          }
                                        }
                                      }}
                                      className="h-10 w-full rounded-lg border-2 border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all cursor-pointer"
                                    >
                                      <option value="NONE">None</option>
                                      <option value="METAL">Metal</option>
                                      <option value="PLASTIC">Plastic</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* File Path Column */}
                            <td className="py-1 px-2 tabular-nums align-top">
                              <div className="flex items-center gap-1.5 min-w-[210px] h-10">
                                <div className="relative flex-1">
                                  <input
                                    id={`error-row-${row.id}-file`}
                                    value={row.fileName || row.tiffPath || ''}
                                    onFocus={(e) => {
                                      try {
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } catch {}
                                    }}
                                    onChange={(e) => {
                                      const cleaned = sanitizeTiffPath(e.target.value);
                                      updateRow(row.id, { tiffPath: cleaned, fileName: '' });
                                      setValidationErrors((prev: any) => ({ ...prev, [`row-${row.id}-file`]: '' }));
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleRowFinalEnter(index);
                                      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                        e.preventDefault();
                                        const finishSelect = document.getElementById(`row-${row.id}-finish-select`);
                                        if (finishSelect && !isDirect) {
                                          finishSelect.focus();
                                        } else {
                                          const rateSqft = document.getElementById(`row-${row.id}-rate-sqft`);
                                          const rateUnit = document.getElementById(`row-${row.id}-rate-unit`);
                                          if (rateSqft && hasMultipleSizes && isModeA) {
                                            rateSqft.focus();
                                            try {
                                              const len = (rateSqft as HTMLInputElement).value ? (rateSqft as HTMLInputElement).value.length : 0;
                                              (rateSqft as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else if (rateUnit) {
                                            rateUnit.focus();
                                            try {
                                              const len = (rateUnit as HTMLInputElement).value ? (rateUnit as HTMLInputElement).value.length : 0;
                                              (rateUnit as HTMLInputElement).setSelectionRange(len, len);
                                            } catch {}
                                          } else {
                                            const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                            if (qtyInput) qtyInput.focus();
                                          }
                                        }
                                      }
                                    }}
                                    className={`h-10 w-full rounded-lg border-2 pl-2.5 pr-7 font-mono text-[10px] outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all ${
                                      validationErrors[`row-${row.id}-file`]
                                        ? 'border-red-400 bg-red-50 text-red-600 placeholder-red-300'
                                        : 'border-slate-200 bg-slate-50 text-slate-800'
                                    }`}
                                    placeholder="Paste path or browse file..."
                                  />
                                  {row.tiffPath && (
                                    <button
                                      type="button"
                                      tabIndex={-1}
                                      onClick={async () => {
                                        const cleanedPath = sanitizeTiffPath(row.tiffPath);
                                        if (row.blobUrl) {
                                          window.open(row.blobUrl, '_blank', 'noopener,noreferrer');
                                        } else if (/^https?:\/\//i.test(cleanedPath) || cleanedPath?.startsWith('/') || cleanedPath?.startsWith('blob:')) {
                                          window.open(cleanedPath, '_blank', 'noopener,noreferrer');
                                        } else {
                                          try {
                                            await navigator.clipboard.writeText(cleanedPath);
                                          } catch {}
                                          toast.custom(
                                            (t) => (
                                              <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-900 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-white/20 p-4 text-white`}>
                                                <div className="flex-1">
                                                  <p className="text-xs font-black text-emerald-400 flex items-center gap-1">
                                                    ✓ PATH COPIED TO CLIPBOARD
                                                  </p>
                                                  <p className="mt-1 text-[11px] text-slate-300 font-medium leading-relaxed">
                                                    Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-cyan-300 font-mono font-bold">Win + R</kbd>, then press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-cyan-300 font-mono font-bold">Ctrl + V</kbd> and hit <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-white font-mono font-bold">Enter</kbd> to open instantly!
                                                  </p>
                                                  <p className="mt-1.5 text-[9.5px] font-mono text-slate-400 truncate bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                                    {cleanedPath}
                                                  </p>
                                                </div>
                                              </div>
                                            ),
                                            { duration: 6000 }
                                          );
                                        }
                                      }}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                      title="Copy Path & View Open Instructions"
                                    >
                                      <Copy size={12} />
                                    </button>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  id={`row-${row.id}-browse-btn`}
                                  onClick={() => {
                                    const inputEl = document.getElementById(`row-${row.id}-file-input`) as HTMLInputElement;
                                    if (inputEl) inputEl.click();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      if (rows.length > 1) {
                                        const delBtn = document.getElementById(`row-${row.id}-delete-btn`);
                                        if (delBtn) delBtn.focus();
                                        else handleRowFinalEnter(index);
                                      } else {
                                        handleRowFinalEnter(index);
                                      }
                                    } else if (e.key === " " || e.key === "Spacebar") {
                                      e.preventDefault();
                                      const inputEl = document.getElementById(`row-${row.id}-file-input`) as HTMLInputElement;
                                      if (inputEl) inputEl.click();
                                    } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
                                      e.preventDefault();
                                      const fileInput = document.getElementById(`error-row-${row.id}-file`);
                                      if (fileInput) fileInput.focus();
                                    }
                                  }}
                                  className={`flex items-center justify-center gap-1 h-10 px-2.5 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-2xs outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 ${
                                    row.tiffPath
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                      : 'bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-blue-600'
                                  }`}
                                  title="Browse file from computer (Space to open file dialog, Enter to next)"
                                >
                                  <Upload size={12} />
                                  <span>{row.tiffPath ? 'Change' : 'Browse'}</span>
                                  <input
                                    id={`row-${row.id}-file-input`}
                                    type="file"
                                    tabIndex={-1}
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleRowFileSelect(row.id, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </button>
                              </div>
                            </td>
                            {/* Amount Column */}
                            <td className="py-1 px-2 text-right align-top">
                              <div className="h-10 flex items-center justify-end text-sm font-black text-slate-900 tabular-nums">
                                {amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                            {/* Delete Button Column */}
                            <td className="py-1 px-1 text-center align-top">
                              <div className="h-10 flex items-center justify-center">
                                <button
                                  id={`row-${row.id}-delete-btn`}
                                  type="button"
                                  disabled={rows.length <= 1}
                                  onClick={() => {
                                    if (rows.length > 1) {
                                      removeRow(row.id);
                                    } else {
                                      toast('Cannot delete the only remaining row.', { icon: 'ℹ️' });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === " " || e.key === "Spacebar") {
                                      e.preventDefault();
                                      if (rows.length > 1) {
                                        removeRow(row.id);
                                        setTimeout(() => {
                                          const targetRow = rows[Math.max(0, index - 1)];
                                          if (targetRow) {
                                            const el = document.getElementById(`row-${targetRow.id}-product-input`);
                                            if (el) el.focus();
                                          }
                                        }, 60);
                                      } else {
                                        toast('Cannot delete the only row', { icon: 'ℹ️' });
                                      }
                                    } else if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleRowFinalEnter(index);
                                    } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
                                      e.preventDefault();
                                      const browseBtn = document.getElementById(`row-${row.id}-browse-btn`);
                                      if (browseBtn) browseBtn.focus();
                                    }
                                  }}
                                  className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all outline-none focus:ring-4 focus:ring-rose-500/30 focus:border-2 focus:border-rose-600 ${
                                    rows.length <= 1
                                      ? 'opacity-20 cursor-not-allowed text-slate-400 bg-slate-100'
                                      : 'bg-rose-50 text-rose-500 hover:bg-rose-100 focus:opacity-100 opacity-70 hover:opacity-100 cursor-pointer'
                                  }`}
                                  title={rows.length <= 1 ? "Cannot delete the only remaining item" : "Delete row (Space to delete, Enter to next row)"}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Section: SUB TOTAL */}
                      <tr className="border-t-2 border-slate-200 bg-slate-100/50">
                        <td className="py-1 px-2"></td>
                        <td colSpan={13} className="py-1 px-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
                          SUB TOTAL
                        </td>
                        <td className="py-1 px-2 text-right font-black tabular-nums text-slate-900 text-xs">
                          {(summary.subTotalBeforeGst ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-1 px-2"></td>
                      </tr>

                      {/* 1. Forwarding / Logistics Charge */}
                      {summary.deliveryCharges > 0 && (
                        <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                          <td className="py-0.5 px-2"></td>
                          <td colSpan={13} className="py-0.5 px-2 font-bold text-slate-800">
                            zForwarding Charge- Sale
                          </td>
                          <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900">
                            {summary.deliveryCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-0.5 px-2"></td>
                        </tr>
                      )}

                      {/* 2. SGST / CGST or IGST Ledger rows */}
                      {summary.igst > 0 ? (
                        <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                          <td className="py-0.5 px-2"></td>
                          <td colSpan={13} className="py-0.5 px-2 font-bold text-slate-800">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>IGST</span>
                              {summary.items?.length > 1 && (
                                <span className="text-[10px] font-semibold text-slate-500 font-mono">
                                  ({summary.items.map((it: any) => it.igst.toFixed(2)).join(' + ')})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900">
                            {summary.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-0.5 px-2"></td>
                        </tr>
                      ) : (
                        <>
                          <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                            <td className="py-0.5 px-2"></td>
                            <td colSpan={13} className="py-0.5 px-2 font-bold text-slate-800">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>SGST</span>
                                {summary.items?.length > 1 && (
                                  <span className="text-[10px] font-semibold text-slate-500 font-mono">
                                    ({summary.items.map((it: any) => it.sgst.toFixed(2)).join(' + ')})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900">
                              {summary.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-0.5 px-2"></td>
                          </tr>
                          <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                            <td className="py-0.5 px-2"></td>
                            <td colSpan={13} className="py-0.5 px-2 font-bold text-slate-800">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>CGST</span>
                                {summary.items?.length > 1 && (
                                  <span className="text-[10px] font-semibold text-slate-500 font-mono">
                                    ({summary.items.map((it: any) => it.cgst.toFixed(2)).join(' + ')})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900">
                              {summary.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-0.5 px-2"></td>
                          </tr>
                        </>
                      )}

                      {/* 3. Voucher / Discount Ledger row (if applied) */}
                      {summary.voucherApplied && (
                        <tr className="border-t border-slate-100 bg-emerald-50/30 text-xs font-bold text-emerald-800">
                          <td className="py-0.5 px-2"></td>
                          <td colSpan={13} className="py-0.5 px-2 font-bold text-emerald-800">
                            Voucher Discount
                          </td>
                          <td className="py-0.5 px-2 text-right font-black tabular-nums text-emerald-700">
                            - {summary.voucherGstDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-0.5 px-2"></td>
                        </tr>
                      )}

                      {/* 4. Round Off Ledger row */}
                      {(() => {
                        const rawTotal = (summary.subTotalBeforeGst || 0) + (summary.gstAmount || 0) + (summary.deliveryCharges || 0) - (summary.voucherGstDiscount || 0);
                        const roundOff = Number((Math.round(summary.grandTotal) - summary.grandTotal).toFixed(2));
                        return (
                          <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                            <td className="py-0.5 px-2"></td>
                            <td colSpan={13} className="py-0.5 px-2 font-bold text-slate-800">
                              Round Off
                            </td>
                            <td className="py-0.5 px-2 text-right font-bold tabular-nums text-slate-600">
                              {roundOff !== 0 ? (roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)) : '0.00'}
                            </td>
                            <td className="py-0.5 px-2"></td>
                          </tr>
                        );
                      })()}
                    </tbody>
                    {/* Tally Total Row (Clean soft borders matching table theme, removing harsh black line) */}
                    <tfoot>
                      <tr className="border-t-2 border-b border-slate-200 bg-slate-50/80 text-xs font-black text-slate-900">
                        <td className="py-1.5 px-2 text-center"></td>
                        <td colSpan={13} className="py-1.5 px-2 font-black uppercase tracking-wider text-slate-800">
                          TOTAL
                        </td>
                        <td className="py-1.5 px-2 text-right font-black tabular-nums text-sm text-slate-950">
                          Rs. {summary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 px-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

              </div>
            </div>

            {/* Bottom Row: Logistics (left) + Action/Payment Terminal (right) */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">

              {/* LEFT: Logistics Card */}
              <div className="rounded-[1.5rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                </div>
                
                <div id="logistics-dropdown-container" className="relative">
                  <button
                    type="button"
                    id="logistics-dropdown-btn"
                    onClick={() => {
                      setLogisticsDropdownOpen(prev => !prev);
                      if (!logisticsDropdownOpen) {
                        const idx = LOGISTICS_OPTIONS.findIndex(o => o.id === deliveryType);
                        if (idx !== -1) setHighlightLogisticsIndex(idx);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Spacebar") {
                        e.preventDefault();
                        setLogisticsDropdownOpen(prev => {
                          const nextState = !prev;
                          if (nextState) {
                            const idx = LOGISTICS_OPTIONS.findIndex(o => o.id === deliveryType);
                            if (idx !== -1) setHighlightLogisticsIndex(idx);
                          }
                          return nextState;
                        });
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (!logisticsDropdownOpen) {
                          setLogisticsDropdownOpen(true);
                          const idx = LOGISTICS_OPTIONS.findIndex(o => o.id === deliveryType);
                          if (idx !== -1) setHighlightLogisticsIndex(idx);
                        } else {
                          setHighlightLogisticsIndex(prev => (prev + 1) % LOGISTICS_OPTIONS.length);
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (!logisticsDropdownOpen) {
                          setLogisticsDropdownOpen(true);
                          const idx = LOGISTICS_OPTIONS.findIndex(o => o.id === deliveryType);
                          if (idx !== -1) setHighlightLogisticsIndex(idx);
                        } else {
                          setHighlightLogisticsIndex(prev => (prev - 1 + LOGISTICS_OPTIONS.length) % LOGISTICS_OPTIONS.length);
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (logisticsDropdownOpen) {
                          const selectedOpt = LOGISTICS_OPTIONS[highlightLogisticsIndex];
                          if (selectedOpt) {
                            setDeliveryType(selectedOpt.id as any);
                            setLogisticsDropdownOpen(false);
                            setTimeout(() => {
                              if (selectedOpt.id !== 'selfPickup') {
                                const addrSelect = document.getElementById('error-shippingAddress') || document.getElementById('add-address-btn');
                                if (addrSelect) {
                                  addrSelect.focus();
                                  addrSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  return;
                                }
                              }
                              const payBtn = document.getElementById('payment-dropdown-btn') || document.getElementById('order-notes');
                              if (payBtn) {
                                payBtn.focus();
                                payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }, 50);
                          }
                        } else {
                          if (deliveryType !== 'selfPickup') {
                            const addrSelect = document.getElementById('error-shippingAddress') || document.getElementById('add-address-btn');
                            if (addrSelect) {
                              addrSelect.focus();
                              addrSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              return;
                            }
                          }
                          const payBtn = document.getElementById('payment-dropdown-btn') || document.getElementById('order-notes');
                          if (payBtn) {
                            payBtn.focus();
                            payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }
                      } else if (e.key === "Escape") {
                        if (logisticsDropdownOpen) {
                          e.preventDefault();
                          setLogisticsDropdownOpen(false);
                        }
                      } else if (e.key === "Backspace") {
                        if (!logisticsDropdownOpen) {
                          e.preventDefault();
                          const lastRow = rows[rows.length - 1];
                          if (lastRow) {
                            const target = document.getElementById(`row-${lastRow.id}-delete-btn`)
                              || document.getElementById(`row-${lastRow.id}-browse-btn`)
                              || document.getElementById(`error-row-${lastRow.id}-file`)
                              || document.getElementById(`row-${lastRow.id}-product-input`);
                            if (target) {
                              target.focus();
                              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }
                        }
                      } else if (['p', 'd', 'c', 't'].includes(e.key.toLowerCase())) {
                        const opt = LOGISTICS_OPTIONS.find(o => o.key === e.key.toLowerCase());
                        if (opt) {
                          e.preventDefault();
                          setDeliveryType(opt.id as any);
                          setHighlightLogisticsIndex(LOGISTICS_OPTIONS.findIndex(o => o.id === opt.id));
                        }
                      }
                    }}
                    className="flex h-11 w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 text-sm font-black tracking-wide text-slate-800 transition-all hover:bg-slate-100/80 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer"
                  >
                    {(() => {
                      const cur = LOGISTICS_OPTIONS.find(o => o.id === deliveryType) || LOGISTICS_OPTIONS[0];
                      return (
                        <>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">
                              {cur.label.charAt(0)}
                            </span>
                            <div className="text-left">
                              <div className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                                <span>{cur.label}</span>
                                <span className="text-[10px] font-bold text-slate-400 normal-case">({cur.sublabel})</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400">
                            <ChevronDown size={16} className={`transition-transform duration-200 ${logisticsDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                          </div>
                        </>
                      );
                    })()}
                  </button>

                  {/* Dropdown Menu */}
                  {logisticsDropdownOpen && (
                    <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                      {LOGISTICS_OPTIONS.map((opt, idx) => {
                        const isHighlighted = idx === highlightLogisticsIndex;
                        const isSelected = deliveryType === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              setDeliveryType(opt.id as any);
                              setLogisticsDropdownOpen(false);
                              setTimeout(() => {
                                if (opt.id !== 'selfPickup') {
                                  const addrSelect = document.getElementById('error-shippingAddress') || document.getElementById('add-address-btn');
                                  if (addrSelect) {
                                    addrSelect.focus();
                                    return;
                                  }
                                }
                                const payBtn = document.getElementById('payment-dropdown-btn') || document.getElementById('order-notes');
                                if (payBtn) payBtn.focus();
                              }, 50);
                            }}
                            onMouseEnter={() => setHighlightLogisticsIndex(idx)}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                              isHighlighted
                                ? 'bg-blue-50 text-blue-900'
                                : isSelected
                                ? 'bg-slate-100 text-slate-900 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                                isSelected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {opt.label.charAt(0)}
                              </span>
                              <div>
                                <span className="text-xs font-black uppercase tracking-wider">{opt.label}</span>
                                <span className="block text-[10px] text-slate-400 font-medium">{opt.sublabel}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <kbd className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{opt.key.toUpperCase()}</kbd>
                              {isSelected && <Check size={14} className="text-blue-600 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {deliveryType !== 'selfPickup' && (
                  <div className="mt-2 space-y-2">
                    {((Array.isArray(selectedCustomer?.addresses) && selectedCustomer.addresses.length > 0) || selectedCustomer?.billing_address_line1 || selectedCustomer?.shipping_address_line1 || selectedCustomer?.address || (selectedCustomer as any)?.billing_city || (selectedCustomer as any)?.city || (selectedCustomer as any)?.billing_state || selectedCustomer?.state || (selectedCustomer as any)?.place_of_supply) ? (
                      <>
                        <select
                          id="error-shippingAddress"
                          className={`h-10 w-full rounded-lg border-2 px-3 text-sm font-medium transition-all ${
                            validationErrors['shippingAddress']
                              ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50/50 text-red-700'
                              : 'border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white'
                          }`}
                          value={shippingAddress}
                          onChange={(e) => {
                            setShippingAddress(e.target.value);
                            setValidationErrors((prev) => {
                              const next = { ...prev };
                              delete next['shippingAddress'];
                              return next;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const addAddrBtn = document.getElementById("add-address-btn");
                              if (addAddrBtn) {
                                addAddrBtn.focus();
                              } else {
                                const payBtn = document.getElementById('payment-dropdown-btn')
                                  || document.getElementById('order-notes');
                                if (payBtn) {
                                  payBtn.focus();
                                  payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }
                            } else if (e.key === "Backspace") {
                              e.preventDefault();
                              const logBtn = document.getElementById('logistics-dropdown-btn');
                              if (logBtn) logBtn.focus();
                            }
                          }}
                        >
                          <option value="">Select Delivery Address</option>
                          {selectedCustomer?.billing_address_line1 && (
                            <option value={[selectedCustomer.billing_address_line1, selectedCustomer.billing_address_line2, selectedCustomer.billing_city, selectedCustomer.billing_state, selectedCustomer.billing_pincode].filter(Boolean).join(', ')}>
                              Primary: {[selectedCustomer.billing_address_line1, selectedCustomer.billing_address_line2, selectedCustomer.billing_city, selectedCustomer.billing_state, selectedCustomer.billing_pincode].filter(Boolean).join(', ')}
                            </option>
                          )}
                          {!selectedCustomer?.billing_address_line1 && ((selectedCustomer as any)?.billing_city || (selectedCustomer as any)?.city || (selectedCustomer as any)?.billing_state || selectedCustomer?.state) && (
                            <option value={[(selectedCustomer as any)?.billing_city || (selectedCustomer as any)?.city, (selectedCustomer as any)?.billing_state || selectedCustomer?.state || (selectedCustomer as any)?.place_of_supply, (selectedCustomer as any)?.billing_pincode || (selectedCustomer as any)?.pincode].filter(Boolean).join(', ')}>
                              Registered Location: {[(selectedCustomer as any)?.billing_city || (selectedCustomer as any)?.city, (selectedCustomer as any)?.billing_state || selectedCustomer?.state || (selectedCustomer as any)?.place_of_supply, (selectedCustomer as any)?.billing_pincode || (selectedCustomer as any)?.pincode].filter(Boolean).join(', ')}
                            </option>
                          )}
                          {selectedCustomer?.shipping_address_line1 && (
                            <option value={[selectedCustomer.shipping_address_line1, selectedCustomer.shipping_address_line2, selectedCustomer.shipping_city, selectedCustomer.shipping_state, selectedCustomer.shipping_pincode].filter(Boolean).join(', ')}>
                              Secondary: {[selectedCustomer.shipping_address_line1, selectedCustomer.shipping_address_line2, selectedCustomer.shipping_city, selectedCustomer.shipping_state, selectedCustomer.shipping_pincode].filter(Boolean).join(', ')}
                            </option>
                          )}
                          {Array.isArray(selectedCustomer?.addresses) && selectedCustomer.addresses.map((addr: any, addrIdx: number) => {
                            const fullAddr = `${selectedCustomer.displayName || selectedCustomer.name} ${selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}\n${addr.houseNumber || ''}, ${addr.roadName || ''}\n${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`;
                            return (
                              <option key={addr.id || addrIdx} value={fullAddr}>
                                {addr.houseNumber || ''}, {addr.roadName || ''}, {addr.city || ''}, {addr.state || ''} - {addr.pincode || ''}
                              </option>
                            );
                          })}
                          {selectedCustomer?.address && <option value={selectedCustomer.address}>Legacy: {selectedCustomer.address}</option>}
                        </select>
                        <button
                          id="add-address-btn"
                          type="button"
                          onClick={() => setShowAddressModal(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const payTab = document.getElementById('payment-dropdown-btn') || document.getElementById('order-notes');
                              if (payTab) payTab.focus();
                            } else if (e.key === " " || e.key === "Spacebar") {
                              e.preventDefault();
                              setShowAddressModal(true);
                            } else if (e.key === "Backspace") {
                              e.preventDefault();
                              const addrSel = document.getElementById('error-shippingAddress');
                              if (addrSel) addrSel.focus();
                              else {
                                const logBtn = document.getElementById('logistics-dropdown-btn');
                                if (logBtn) logBtn.focus();
                              }
                            }
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-blue-500 mt-1 hover:underline cursor-pointer focus:border-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none rounded px-1.5 py-0.5 border-2 border-transparent inline-block"
                        >
                          + Add Address
                        </button>
                      </>
                    ) : (
                      <button
                        id="error-shippingAddress"
                        type="button"
                        onClick={() => setShowAddressModal(true)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Spacebar") {
                            e.preventDefault();
                            setShowAddressModal(true);
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const payBtn = document.getElementById('payment-dropdown-btn')
                              || document.getElementById('order-notes');
                            if (payBtn) {
                              payBtn.focus();
                              payBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          } else if (e.key === "Backspace") {
                            e.preventDefault();
                            const logBtn = document.getElementById('logistics-dropdown-btn');
                            if (logBtn) logBtn.focus();
                          }
                        }}
                        className={`flex h-10 w-full items-center justify-center rounded-xl border-2 border-dashed text-[11px] font-bold uppercase tracking-widest transition-all focus:border-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer ${
                          validationErrors['shippingAddress'] ? 'border-red-500 ring-4 ring-red-500/30 bg-red-50 text-red-600' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        title="Press Space to add address, or Enter to go to Terminal"
                      >
                        + Delivery Address
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: Payment / Quotation Actions Card */}
              <div>
                <div className="rounded-[1.5rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {vm.mode === 'quotation' ? 'Quotation Actions' : 'Payment Terminal'}
                    </h3>
                  </div>
                  
                  {vm.mode !== 'quotation' && (
                    <>
                      {/* Payment Mode Dropdown */}
                      <div id="payment-dropdown-container" className="relative mb-2">
                        <button
                          type="button"
                          id="payment-dropdown-btn"
                          onClick={() => {
                            setPaymentDropdownOpen(prev => !prev);
                            if (!paymentDropdownOpen) {
                              const idx = PAYMENT_OPTIONS.findIndex(o => o.id === paymentMode);
                              if (idx !== -1) setHighlightPaymentIndex(idx);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Spacebar") {
                              e.preventDefault();
                              setPaymentDropdownOpen(prev => {
                                const nextState = !prev;
                                if (nextState) {
                                  const idx = PAYMENT_OPTIONS.findIndex(o => o.id === paymentMode);
                                  if (idx !== -1) setHighlightPaymentIndex(idx);
                                }
                                return nextState;
                              });
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              if (!paymentDropdownOpen) {
                                setPaymentDropdownOpen(true);
                                const idx = PAYMENT_OPTIONS.findIndex(o => o.id === paymentMode);
                                if (idx !== -1) setHighlightPaymentIndex(idx);
                              } else {
                                setHighlightPaymentIndex(prev => (prev + 1) % PAYMENT_OPTIONS.length);
                              }
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              if (!paymentDropdownOpen) {
                                setPaymentDropdownOpen(true);
                                const idx = PAYMENT_OPTIONS.findIndex(o => o.id === paymentMode);
                                if (idx !== -1) setHighlightPaymentIndex(idx);
                              } else {
                                setHighlightPaymentIndex(prev => (prev - 1 + PAYMENT_OPTIONS.length) % PAYMENT_OPTIONS.length);
                              }
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              if (paymentDropdownOpen) {
                                const selectedOpt = PAYMENT_OPTIONS[highlightPaymentIndex];
                                if (selectedOpt) {
                                  setPaymentMode(selectedOpt.id as any);
                                  setPaymentMethodTab(selectedOpt.tab);
                                  setPaymentDropdownOpen(false);
                                  setTimeout(() => {
                                    const next = document.getElementById('order-notes')
                                      || document.getElementById('confirm-dimensions');
                                    if (next) {
                                      next.focus();
                                      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                  }, 50);
                                }
                              } else {
                                const next = document.getElementById('order-notes')
                                  || document.getElementById('confirm-dimensions');
                                if (next) {
                                  next.focus();
                                  next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }
                            } else if (e.key === "Escape") {
                              if (paymentDropdownOpen) {
                                e.preventDefault();
                                setPaymentDropdownOpen(false);
                              }
                            } else if (e.key === "Backspace") {
                              if (!paymentDropdownOpen) {
                                e.preventDefault();
                                if (deliveryType !== 'selfPickup') {
                                  const addrBtn = document.getElementById('add-address-btn') || document.getElementById('error-shippingAddress');
                                  if (addrBtn) {
                                    addrBtn.focus();
                                    return;
                                  }
                                }
                                const logBtn = document.getElementById('logistics-dropdown-btn');
                                if (logBtn) logBtn.focus();
                              }
                            } else if (['c', 'u', 'b', 'o', 'r'].includes(e.key.toLowerCase())) {
                              const opt = PAYMENT_OPTIONS.find(o => o.key === e.key.toLowerCase());
                              if (opt) {
                                e.preventDefault();
                                setPaymentMode(opt.id as any);
                                setPaymentMethodTab(opt.tab);
                                setHighlightPaymentIndex(PAYMENT_OPTIONS.findIndex(o => o.id === opt.id));
                              }
                            }
                          }}
                          className="flex h-11 w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 text-sm font-black tracking-wide text-slate-800 transition-all hover:bg-slate-100/80 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:outline-none cursor-pointer"
                        >
                          {(() => {
                            const cur = PAYMENT_OPTIONS.find(o => o.id === paymentMode) || PAYMENT_OPTIONS[0];
                            return (
                              <>
                                <div className="flex items-center gap-2.5">
                                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                                    cur.id === 'CREDIT' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-white'
                                  }`}>
                                    {cur.label.charAt(0)}
                                  </span>
                                  <div className="text-left">
                                    <div className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                                      <span>{cur.label}</span>
                                      <span className="text-[10px] font-bold text-slate-400 normal-case">({cur.description})</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-slate-400">
                                  <ChevronDown size={16} className={`transition-transform duration-200 ${paymentDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                                </div>
                              </>
                            );
                          })()}
                        </button>

                        {/* Dropdown Menu */}
                        {paymentDropdownOpen && (
                          <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                            {PAYMENT_OPTIONS.map((opt, idx) => {
                              const isHighlighted = idx === highlightPaymentIndex;
                              const isSelected = paymentMode === opt.id;
                              return (
                                <div
                                  key={opt.id}
                                  onClick={() => {
                                    setPaymentMode(opt.id as any);
                                    setPaymentMethodTab(opt.tab);
                                    setPaymentDropdownOpen(false);
                                    setTimeout(() => {
                                      const next = document.getElementById('order-notes')
                                        || document.getElementById('confirm-dimensions');
                                      if (next) next.focus();
                                    }, 50);
                                  }}
                                  onMouseEnter={() => setHighlightPaymentIndex(idx)}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                    isHighlighted
                                      ? 'bg-blue-50 text-blue-900'
                                      : isSelected
                                      ? 'bg-slate-100 text-slate-900 font-bold'
                                      : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                                      opt.id === 'CREDIT' ? 'bg-purple-600 text-white' : isSelected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                      {opt.label.charAt(0)}
                                    </span>
                                    <div>
                                      <span className="text-xs font-black uppercase tracking-wider">{opt.label}</span>
                                      <span className="block text-[10px] text-slate-400 font-medium">{opt.description}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <kbd className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{opt.key.toUpperCase()}</kbd>
                                    {isSelected && <Check size={14} className="text-blue-600 stroke-[3]" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {paymentMode === 'CREDIT' && selectedCustomer?.customerType === 'CASH' && (
                        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[11px] font-bold text-amber-800 flex items-start gap-1.5 leading-relaxed shadow-sm">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          <span>Note: Customer account is set to CASH mode. Selecting CREDIT may require manual approval.</span>
                        </div>
                      )}

                      {paymentMode === 'CREDIT' && selectedCustomer && (
                        <div className="mb-2">
                          {(() => {
                            const creditLimit = selectedCustomer.creditLimit || 0;
                            const usedCredit = selectedCustomer.usedCredit || 0;
                            const available = creditLimit - usedCredit;
                            const isExceeded = summary.grandTotal > available;
                            return (
                              <div className={`p-3 rounded-xl border ${isExceeded ? 'bg-red-50 border-red-200 text-red-600' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1">
                                  <span>Available Credit</span>
                                  <span>₹{available.toLocaleString()}</span>
                                </div>
                                {isExceeded && (
                                  <p className="text-[9px] font-bold text-red-500 uppercase tracking-tight mt-1">
                                    Exceeds credit limit by ₹{(summary.grandTotal - available).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}

                  {/* Additional Notes block */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <div className="w-1 h-4 rounded-full bg-blue-500 flex-shrink-0" />
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-700 leading-tight">
                        Additional Notes
                        <span className="block text-[9px] font-semibold normal-case tracking-normal text-slate-400 mt-0.5">by consumer for order processing</span>
                      </label>
                    </div>
                    <textarea 
                      id="order-notes"
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const target = e.currentTarget;
                          const { selectionStart, value } = target;
                          const beforeCursor = value.substring(0, selectionStart);
                          const lastNewline = beforeCursor.lastIndexOf('\n');
                          const currentLine = beforeCursor.substring(lastNewline + 1);

                          // If current line is empty, finish Additional Notes and advance to submit
                          if (currentLine.trim() === '') {
                            e.preventDefault();
                            const cleaned = notes.trimEnd();
                            setNotes(cleaned);
                            const submitBtn = document.getElementById("submit-order-btn");
                            if (submitBtn) {
                              submitBtn.focus();
                              submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }
                        } else if (e.key === "Backspace" && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                          e.preventDefault();
                          if (vm.mode === 'quotation') {
                            const lastRow = rows[rows.length - 1];
                            if (lastRow) {
                              const target = document.getElementById(`row-${lastRow.id}-delete-btn`)
                                || document.getElementById(`row-${lastRow.id}-browse-btn`)
                                || document.getElementById(`error-row-${lastRow.id}-file`);
                              if (target) target.focus();
                            }
                          } else {
                            const payBtn = document.getElementById('payment-dropdown-btn');
                            if (payBtn) payBtn.focus();
                          }
                        }
                      }}
                      placeholder="Specific color needs, hardware requirements..."
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2 text-xs h-16 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white font-semibold resize-none transition-all"
                    />
                  </div>

                  {summary.isVoucherEligible && (
                    <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 p-3 border border-emerald-100">
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-800">Type 1 Voucher</span>
                      <button
                        type="button"
                        onClick={() => setApplyVoucher(!applyVoucher)}
                        className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                          applyVoucher 
                            ? 'bg-emerald-600 text-white shadow-md' 
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                      >
                        {applyVoucher ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    id="submit-order-btn"
                    onClick={validateAndSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        validateAndSubmit();
                      } else if (e.key === "Backspace") {
                        e.preventDefault();
                        const notesEl = document.getElementById("order-notes");
                        if (notesEl) {
                          notesEl.focus();
                          notesEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }
                    }}
                    disabled={loading || upiUploading || (vm.mode !== 'quotation' && creditExceeded)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/25 hover:bg-[#00a892] disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none transition-all focus:ring-4 focus:ring-emerald-500/30 outline-none cursor-pointer"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                    {vm.mode === 'quotation' ? 'CREATE QUOTATION' : 'PLACE ORDER'}
                  </button>
                </div>
              </div>
            </div>



          </div>
        </div>

      {/* Create Customer Modal */}
      {showCreateCustomer && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm overflow-y-auto py-4">
              <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl my-auto border border-slate-200/50">
                <div className="mb-4 flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Customer Credentials</h4>
                    <h3 className="text-xl font-black text-slate-900">Create customer login</h3>
                  </div>
                  <button onClick={() => setShowCreateCustomer(false)} className="text-slate-400 hover:text-slate-900 text-xl font-bold leading-none">×</button>
                </div>
                
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Business Name</label>
                    <input type="text" value={newCustomerForm.businessName} onChange={(e) => setNewCustomerForm(f => ({ ...f, businessName: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Email</label>
                    <input type="email" value={newCustomerForm.email} onChange={(e) => setNewCustomerForm(f => ({ ...f, email: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Phone</label>
                    <input type="text" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">State</label>
                    <select value={newCustomerForm.state} onChange={(e) => setNewCustomerForm(f => ({ ...f, state: e.target.value }))} className="h-8 w-full rounded border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-400">
                      <option value="" disabled>Select State</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Country</label>
                    <input type="text" value={newCustomerForm.country} onChange={(e) => setNewCustomerForm(f => ({ ...f, country: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Pincode</label>
                    <input type="text" value={newCustomerForm.pincode} onChange={(e) => setNewCustomerForm(f => ({ ...f, pincode: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">House No., Building Name</label>
                    <input type="text" value={newCustomerForm.houseNumber} onChange={(e) => setNewCustomerForm(f => ({ ...f, houseNumber: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Road Name, Area, Colony</label>
                    <input type="text" value={newCustomerForm.roadName} onChange={(e) => setNewCustomerForm(f => ({ ...f, roadName: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">City</label>
                    <input type="text" value={newCustomerForm.city} onChange={(e) => setNewCustomerForm(f => ({ ...f, city: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">GST Type</label>
                    <select value={newCustomerForm.gstType} onChange={(e) => setNewCustomerForm(f => ({ ...f, gstType: e.target.value as any }))} className="h-8 w-full rounded border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-400">
                      <option value="Unregistered">Unregistered</option>
                      <option value="Regular">Regular</option>
                      <option value="Composition">Composition</option>
                    </select>
                  </div>
                  {newCustomerForm.gstType !== 'Unregistered' && (
                    <div>
                      <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">GST Number <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <input type="text" value={newCustomerForm.gstNumber} onChange={(e) => setNewCustomerForm(f => ({ ...f, gstNumber: e.target.value.toUpperCase(), gstVerified: false }))} className="h-8 flex-1 rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400 font-mono uppercase" />
                        <button onClick={handleVerifyGst} disabled={verifyingGst} className="h-8 px-3 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-100 disabled:opacity-50 transition-colors shrink-0">
                          {verifyingGst ? 'Verifying...' : newCustomerForm.gstVerified ? 'Verified ✓' : 'Verify'}
                        </button>
                      </div>
                      {newCustomerForm.gstVerified && newCustomerForm.gstDetails && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md text-[10px] text-green-900 space-y-1">
                          <div className="font-bold mb-1 text-green-700 pb-1 border-b border-green-200">✓ GST Verified Successfully</div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            <div><span className="font-semibold text-green-800">Legal Name:</span> <span className="block truncate" title={newCustomerForm.gstDetails.legalName}>{newCustomerForm.gstDetails.legalName}</span></div>
                            {newCustomerForm.gstDetails.tradeName && <div><span className="font-semibold text-green-800">Trade Name:</span> <span className="block truncate" title={newCustomerForm.gstDetails.tradeName}>{newCustomerForm.gstDetails.tradeName}</span></div>}
                            <div><span className="font-semibold text-green-800">Status:</span> {newCustomerForm.gstDetails.status}</div>
                            {newCustomerForm.gstDetails.registrationDate && <div><span className="font-semibold text-green-800">Registration:</span> {newCustomerForm.gstDetails.registrationDate}</div>}
                            {newCustomerForm.gstDetails.constitution && <div><span className="font-semibold text-green-800">Constitution:</span> <span className="block truncate" title={newCustomerForm.gstDetails.constitution}>{newCustomerForm.gstDetails.constitution}</span></div>}
                            {newCustomerForm.gstDetails.taxpayerType && <div><span className="font-semibold text-green-800">Taxpayer Type:</span> {newCustomerForm.gstDetails.taxpayerType}</div>}
                            {newCustomerForm.gstDetails.jurisdictionState && <div><span className="font-semibold text-green-800">State Juris.:</span> <span className="block truncate" title={newCustomerForm.gstDetails.jurisdictionState}>{newCustomerForm.gstDetails.jurisdictionState}</span></div>}
                            {newCustomerForm.gstDetails.jurisdictionCenter && <div><span className="font-semibold text-green-800">Center Juris.:</span> <span className="block truncate" title={newCustomerForm.gstDetails.jurisdictionCenter}>{newCustomerForm.gstDetails.jurisdictionCenter}</span></div>}
                          </div>
                          {newCustomerForm.gstDetails.address && (
                            <div className="mt-1 pt-1 border-t border-green-200/50">
                              <span className="font-semibold text-green-800">Address:</span> 
                              <p className="mt-0.5 leading-tight opacity-90">{newCustomerForm.gstDetails.address}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}


                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Customer Type</label>
                    <select value={newCustomerForm.customerType} onChange={(e) => setNewCustomerForm(f => ({ ...f, customerType: e.target.value as any }))} className="h-8 w-full rounded border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-400">
                      <option value="CASH">CASH</option>
                      <option value="CREDIT">CREDIT</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Voucher Type</label>
                    <select value={newCustomerForm.voucherType} onChange={(e) => setNewCustomerForm(f => ({ ...f, voucherType: e.target.value as any }))} className="h-8 w-full rounded border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-400">
                      <option value="Type 0">Type 0 (Normal)</option>
                      <option value="Type 1">Type 1 (Discount)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Temporary Password</label>
                    <input type="text" value={newCustomerForm.tempPassword} onChange={(e) => setNewCustomerForm(f => ({ ...f, tempPassword: e.target.value }))} className="h-8 w-full rounded border border-slate-200 px-3 text-[13px] outline-none focus:border-slate-400" />
                    <p className="mt-1 text-[11px] text-slate-500">Customer will be able to login with these credentials and see the customer dashboard.</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <button onClick={handleCreateCustomer} disabled={creatingCustomer} className="px-5 h-11.5 rounded bg-[#0f172a] text-[10px] font-bold tracking-widest text-white uppercase hover:bg-slate-800 disabled:opacity-50">
                    {creatingCustomer ? 'Saving...' : 'Create Customer'}
                  </button>
                </div>
                {createdCustomer && (
                  <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                    Credentials Ready: {createdCustomer.email} / {createdCustomer.password}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Address Modal */}
          {showAddressModal && (
            <div
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape" || (e.key === "Backspace" && !addressForm.houseNo && !addressForm.roadName)) {
                  e.preventDefault();
                  setShowAddressModal(false);
                  setTimeout(() => {
                    const btn = document.getElementById("add-address-btn") || document.getElementById("error-shippingAddress");
                    if (btn) btn.focus();
                  }, 80);
                }
              }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
            >
              <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl border border-slate-100">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Add Delivery Address</h3>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setShowAddressModal(false);
                      setTimeout(() => {
                        const btn = document.getElementById("add-address-btn") || document.getElementById("error-shippingAddress");
                        if (btn) btn.focus();
                      }, 80);
                    }}
                    className="text-slate-400 hover:text-slate-900 font-bold text-lg"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    id="modal-house-no"
                    placeholder="House No."
                    value={addressForm.houseNo}
                    onChange={(e) => setAddressForm(f => ({ ...f, houseNo: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-road-name");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && (!addressForm.houseNo || addressForm.houseNo.trim() === '')) {
                        e.preventDefault();
                        setShowAddressModal(false);
                        setTimeout(() => {
                          const btn = document.getElementById("add-address-btn") || document.getElementById("error-shippingAddress");
                          if (btn) btn.focus();
                        }, 80);
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none md:col-span-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <input
                    id="modal-road-name"
                    placeholder="Road Name"
                    value={addressForm.roadName}
                    onChange={(e) => setAddressForm(f => ({ ...f, roadName: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-area");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && !addressForm.roadName) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-house-no");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none md:col-span-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <input
                    id="modal-area"
                    placeholder="Area / Locality"
                    value={addressForm.area}
                    onChange={(e) => setAddressForm(f => ({ ...f, area: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-city");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && !addressForm.area) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-road-name");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <input
                    id="modal-city"
                    placeholder="City"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm(f => ({ ...f, city: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-district");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && !addressForm.city) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-area");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <input
                    id="modal-district"
                    placeholder="District"
                    value={addressForm.district}
                    onChange={(e) => setAddressForm(f => ({ ...f, district: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-state");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && !addressForm.district) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-city");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <select
                    id="modal-state"
                    value={addressForm.state}
                    onChange={(e) => setAddressForm(f => ({ ...f, state: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-state-code");
                        if (next) next.focus();
                      } else if (e.key === "Backspace") {
                        e.preventDefault();
                        const prev = document.getElementById("modal-district");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-semibold outline-none appearance-none cursor-pointer focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="" disabled>Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    id="modal-state-code"
                    placeholder="State Code"
                    value={addressForm.stateCode}
                    onChange={(e) => setAddressForm(f => ({ ...f, stateCode: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = document.getElementById("modal-pincode");
                        if (next) next.focus();
                      } else if (e.key === "Backspace" && !addressForm.stateCode) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-state");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                  <input
                    id="modal-pincode"
                    placeholder="Pincode"
                    value={addressForm.pincode}
                    onChange={(e) => setAddressForm(f => ({ ...f, pincode: e.target.value }))}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const saveBtn = document.getElementById("modal-save-address-btn");
                        if (saveBtn) saveBtn.focus();
                      } else if (e.key === "Backspace" && !addressForm.pincode) {
                        e.preventDefault();
                        const prev = document.getElementById("modal-state-code");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                  />
                </div>
                <div className="mt-8 flex gap-3">
                  <button
                    id="modal-cancel-btn"
                    type="button"
                    onClick={() => {
                      setShowAddressModal(false);
                      setTimeout(() => {
                        const btn = document.getElementById("add-address-btn") || document.getElementById("error-shippingAddress");
                        if (btn) btn.focus();
                      }, 80);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace") {
                        e.preventDefault();
                        const prev = document.getElementById("modal-pincode");
                        if (prev) prev.focus();
                      }
                    }}
                    className="h-12 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200 focus:border-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none border-2 border-transparent transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    id="modal-save-address-btn"
                    type="button"
                    onClick={async () => {
                      const success = await handleAddDeliveryAddress({
                        pincode: addressForm.pincode, state: addressForm.state, stateCode: addressForm.stateCode, district: addressForm.district, city: addressForm.city, houseNumber: addressForm.houseNo, roadName: addressForm.roadName, area: addressForm.area
                      });
                      if (success) {
                        setShowAddressModal(false);
                        setTimeout(() => {
                          const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                          if (firstProductInput) {
                            firstProductInput.focus();
                            try {
                              const len = (firstProductInput as HTMLInputElement).value ? (firstProductInput as HTMLInputElement).value.length : 0;
                              (firstProductInput as HTMLInputElement).setSelectionRange(len, len);
                            } catch {}
                          }
                        }, 120);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace") {
                        e.preventDefault();
                        const prev = document.getElementById("modal-pincode");
                        if (prev) prev.focus();
                      }
                    }}
                    disabled={addingAddress}
                    className="h-12 flex-1 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 focus:border-2 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:outline-none border-2 border-transparent transition-all"
                  >
                    {addingAddress ? 'Saving...' : 'Save Address'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Order Placement Confirmation Dialog */}
          {showConfirmOrderModal && (
            <div 
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md animate-in fade-in duration-150"
            >
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shrink-0">
                    <CheckCircle2 size={26} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {vm.mode === 'quotation' ? 'Create Quotation?' : 'Are you sure you want to place order?'}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      {vm.mode === 'quotation' ? 'Confirm quotation details' : 'Dimensions match industrial specs & artwork is final'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-5 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Customer</span>
                    <span className="font-bold text-slate-900 truncate max-w-[200px]">
                      {selectedCustomer?.displayName || selectedCustomer?.name || selectedCustomer?.businessName || 'Customer'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Total Items</span>
                    <span className="font-bold text-slate-900">
                      {rows.filter((r: any) => r.productId).length} Item(s)
                    </span>
                  </div>
                  {vm.mode !== 'quotation' && (
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Payment Mode</span>
                      <span className="font-bold uppercase text-slate-900 px-2 py-0.5 rounded bg-slate-200/80 text-[10px]">
                        {paymentMode}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Sub Total</span>
                    <span className="font-bold text-slate-900">
                      Rs. {(summary.subTotalBeforeGst ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-slate-950">
                    <span>Grand Total</span>
                    <span className="text-base text-emerald-600 font-black">
                      Rs. {summary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    id="confirm-order-cancel-btn"
                    onClick={() => {
                      setShowConfirmOrderModal(false);
                      setTimeout(() => {
                        const submitBtn = document.getElementById("submit-order-btn");
                        if (submitBtn) submitBtn.focus();
                      }, 50);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 bg-slate-100 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>No</span>
                    <kbd className="text-[9px] font-mono bg-slate-200 text-slate-600 px-1 py-0.5 rounded border border-slate-300">N / Esc</kbd>
                  </button>
                  <button
                    type="button"
                    id="confirm-order-yes-btn"
                    autoFocus
                    onClick={() => {
                      setShowConfirmOrderModal(false);
                      if (paymentMethodTab === 'CREDIT') {
                        setShowCreditModal(true);
                      } else {
                        submitProxyOrder();
                      }
                    }}
                    disabled={loading}
                    className="flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#00bfa5] hover:bg-[#00a892] transition-colors shadow-lg shadow-[#00bfa5]/25 disabled:opacity-50 flex justify-center items-center gap-1.5 cursor-pointer"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                    <span>Yes</span>
                    <kbd className="text-[9px] font-mono bg-[#008f7c] text-white px-1 py-0.5 rounded">Y / ↵</kbd>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Credit Confirmation Modal */}
          {showCreditModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100">
                <h3 className="text-lg font-black tracking-tight text-slate-900 mb-2">Confirm Credit Usage</h3>
                <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
                  A credit amount of <strong className="text-slate-900">₹{summary.grandTotal.toLocaleString()}</strong> will be deducted from the customer's account balance. Do you want to proceed?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreditModal(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowCreditModal(false);
                      submitProxyOrder();
                    }}
                    disabled={loading}
                    className="flex-1 py-3 px-4 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                    {loading && <Loader2 className="animate-spin" size={16} />}
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Escape / Back Exit Confirmation Modal */}
          {showExitConfirmModal && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md animate-in fade-in duration-150">
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shrink-0">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Return to Global Orders?</h3>
                    <p className="text-xs font-semibold text-slate-500">Unsaved entries will be discarded</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-6 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 font-medium">
                  Are you sure you want to exit the Order Terminal and go back to Global Orders? Any draft items, calculations, and notes will not be saved.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowExitConfirmModal(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-100 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel (Stay)
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      const targetUrl = process.env.NEXT_PUBLIC_PIXEL_MARKETING_URL
                        ? `${process.env.NEXT_PUBLIC_PIXEL_MARKETING_URL}/admin/orders`
                        : '/admin/orders';
                      window.location.href = targetUrl;
                    }}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700 shadow-md transition-colors cursor-pointer"
                  >
                    Yes, Go Back
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Item Description Multiline Modal (Tally Style) */}
          {activeDescRowId && (
            <ItemDescriptionModal
              isOpen={Boolean(activeDescRowId)}
              onClose={() => setActiveDescRowId(null)}
              onBackNavigate={() => handleBackFromDescModal(activeDescRowId)}
              onSaveAndAdvance={(text) => handleSaveDescAndAdvance(activeDescRowId, text)}
              initialValue={rows.find((r: any) => r.id === activeDescRowId)?.description || rows.find((r: any) => r.id === activeDescRowId)?.projectName || ''}
              itemName={products.find((p: any) => p.id === rows.find((r: any) => r.id === activeDescRowId)?.productId)?.name || 'Stock Item'}
              title="Description for Stock Item"
            />
          )}

          {/* Tally Full Vertical Right Sidebar Drawer (List of Ledger Accounts / List of Stock Items) */}
          {(customerDropdownOpen || openRowId) && !activeDescRowId && (
            <div 
              className="fixed right-0 top-0 bottom-0 w-[900px] lg:w-[980px] max-w-[96vw] z-[99999] bg-[#eef6ff] border-l-2 border-[#1a4a7a] shadow-2xl flex flex-col animate-in slide-in-from-right duration-150 font-sans"
            >
              {customerDropdownOpen ? (
                <>
                  {/* Ledger Header */}
                  <div className="bg-[#1a4a7a] text-white py-2 px-4 flex items-center justify-between border-b border-[#12365a] shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-wide">List of Ledger Accounts</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomerDropdownOpen(false)}
                      className="h-5 px-2 rounded bg-[#12365a] hover:bg-[#0c2640] text-[10px] font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Esc</span> ✕
                    </button>
                  </div>

                  {/* Column Subheader Bar */}
                  <div className="bg-[#dbeafc] border-b border-[#bad5f5] text-[#1a3a60] text-[11px] font-bold py-1.5 px-4 flex items-center justify-between shrink-0 select-none">
                    <div className="flex-1 font-bold">Name of Ledger</div>
                    <div className="w-48 text-left shrink-0">City / Area</div>
                    <div className="w-44 text-center shrink-0">GSTIN</div>
                    <div className="w-32 text-right shrink-0">Balance</div>
                  </div>

                  {/* Top Actions: + Create (Alt+C) */}
                  <div className="bg-[#e2f0fd] border-b border-[#bad5f5] py-1 px-3 flex items-center justify-between shrink-0">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowCreateCustomer(true);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold tracking-wide transition-colors"
                    >
                      <Plus size={11} />
                      <span>Create (Alt+C)</span>
                    </button>
                    {customerSearch && (
                      <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-[#bad5f5]">
                        Filter: "{customerSearch}"
                      </span>
                    )}
                  </div>

                  {/* Customer list */}
                  <div onScroll={handleCustomerScroll} className="flex-1 overflow-y-auto bg-[#eef6ff]">
                    {customerSearching && (
                      <div className="p-3 text-xs font-semibold text-blue-700 bg-blue-50/70 flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin" /> Searching customer ledgers...
                      </div>
                    )}
                    {sortedCustomers.length === 0 && !customerSearching ? (
                      <div className="p-8 text-center">
                        <p className="text-xs font-bold text-slate-500">No matching ledger accounts found</p>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setShowCreateCustomer(true);
                          }}
                          className="mt-3 px-3 py-1 rounded bg-[#1a4a7a] text-white text-xs font-bold"
                        >
                          + Create New Customer
                        </button>
                      </div>
                    ) : (
                      visibleCustomers.map((c: any, idx: number) => {
                        const isHighlighted = idx === highlightCustomerIndex;
                        const isSelected = (c.uid || c.id) === selectedCustomerId;
                        return (
                          <div
                            key={c.uid || c.id}
                            id={`customer-item-${idx}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCustomerId(c.uid || c.id);
                              setCustomerDropdownOpen(false);
                              setCustomerSearch('');
                              setHighlightCustomerIndex(0);
                              const firstRowId = rows[0]?.id;
                              if (firstRowId) {
                                setOpenRowId(firstRowId);
                                setSearchQuery('');
                              }
                              const focusItem = () => {
                                const firstProductInput = (firstRowId ? document.getElementById(`row-${firstRowId}-product-input`) : null)
                                  || (document.querySelector('input[placeholder="Select item..."]') as HTMLElement);
                                if (firstProductInput) firstProductInput.focus();
                              };
                              focusItem();
                              requestAnimationFrame(focusItem);
                            }}
                            className={`py-1.5 px-3 cursor-pointer transition-colors flex items-center justify-between text-xs select-none ${
                              isHighlighted
                                ? 'bg-[#f5a623] text-black font-extrabold shadow-xs'
                                : isSelected
                                  ? 'bg-[#d8eafb] text-[#0f2942] font-bold'
                                  : 'hover:bg-[#ddebfa] text-[#1e293b]'
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="truncate font-bold text-xs leading-tight">
                                <HighlightMatch text={c.displayName || c.name} query={customerSearch} isHighlighted={isHighlighted} />
                              </div>
                              {c.phone && (
                                <div className={`text-[10px] ${isHighlighted ? 'text-black/80' : 'text-slate-500'}`}>
                                  <HighlightMatch text={c.phone} query={customerSearch} isHighlighted={isHighlighted} />
                                </div>
                              )}
                            </div>
                            <div className={`w-48 text-left truncate text-[11px] shrink-0 ${isHighlighted ? 'text-black font-bold' : 'text-slate-600'}`}>
                              <HighlightMatch text={c.businessName || c.billing_city || '—'} query={customerSearch} isHighlighted={isHighlighted} />
                            </div>
                            <div className={`w-44 text-center font-mono text-[11px] truncate shrink-0 ${isHighlighted ? 'text-black font-bold' : 'text-slate-600'}`}>
                              <HighlightMatch text={c.gstin || '—'} query={customerSearch} isHighlighted={isHighlighted} />
                            </div>
                            <div className={`w-32 text-right font-bold text-[11px] shrink-0 ${isHighlighted ? 'text-black' : 'text-slate-800'}`}>
                              {c.credit_balance !== undefined ? `₹${Number(c.credit_balance || 0).toLocaleString()}` : '—'}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer shortcuts */}
                  <div className="bg-[#1a4a7a] text-white py-1 px-4 text-[10px] font-mono flex items-center justify-between border-t border-[#12365a] shrink-0 select-none">
                    <span>↑/↓ Navigate • ↵ Enter Select</span>
                    <span>Esc Close</span>
                  </div>
                </>
              ) : openRowId ? (
                (() => {
                  const activeRow = rows.find((r: any) => r.id === openRowId);
                  const matched = matchedProducts;
                  const isCtActive = /^ct([:\s\-\/]|$)/i.test(searchQuery.trim());
                  const ctSearchParam = searchQuery.trim().replace(/^ct[:\s\-\/]?\s*/i, '').trim();

                  let runningIdx = 0;

                  return (
                    <>
                      {/* Stock Items Header */}
                      <div className="bg-[#1a4a7a] text-white py-2 px-4 flex items-center justify-between border-b border-[#12365a] shrink-0 select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black tracking-wide">Stock Items</span>
                          {selectedCategory && (
                            <span className="bg-[#f5a623] text-black text-[10px] font-black px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                              <span>{selectedCategory}</span>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedCategory(null);
                                  setHighlightProductIndex(0);
                                }}
                                className="hover:bg-black/20 rounded px-0.5 ml-0.5 cursor-pointer"
                                title="Clear Category Filter"
                              >
                                ✕
                              </button>
                            </span>
                          )}
                          {isCtActive && (
                            <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                              <span>ct {ctSearchParam ? `"${ctSearchParam}"` : '(All Categories)'}</span>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenRowId(null);
                            setSelectedCategory(null);
                          }}
                          className="h-5 px-2 rounded bg-[#12365a] hover:bg-[#0c2640] text-[10px] font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Esc</span> ✕
                        </button>
                      </div>

                      {/* Category Filter Chips Bar */}
                      {availableCategories.length > 0 && (
                        <div className="bg-[#102d4b] px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b border-[#0c243c] shrink-0 select-none" style={{ scrollbarWidth: 'none' }}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCategory(null);
                              setHighlightProductIndex(0);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer ${
                              !selectedCategory
                                ? 'bg-[#f5a623] text-black font-black shadow-xs'
                                : 'bg-[#1a4a7a] text-blue-100 hover:bg-[#235b94]'
                            }`}
                          >
                            All ({products.length})
                          </button>
                          {availableCategories.map((cat) => {
                            const count = products.filter((p: any) => (p.category || '').trim().toLowerCase() === cat.toLowerCase()).length;
                            const isCatActive = selectedCategory?.toLowerCase() === cat.toLowerCase();
                            return (
                              <button
                                key={cat}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedCategory(isCatActive ? null : cat);
                                  setHighlightProductIndex(0);
                                }}
                                className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                  isCatActive
                                    ? 'bg-[#f5a623] text-black font-black shadow-xs'
                                    : 'bg-[#1a4a7a] text-blue-100 hover:bg-[#235b94]'
                                }`}
                              >
                                <span>{cat}</span>
                                <span className={`text-[10px] opacity-75 font-normal`}>({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Column Subheader Bar (Exact Tally Columns) */}
                      <div className="bg-[#dbeafc] border-b border-[#bad5f5] text-[#1a3a60] text-[11px] font-bold py-1.5 px-4 flex items-center justify-between shrink-0 select-none">
                        <div className="flex-1 font-bold">Stock Item Name</div>
                        <div className="w-28 text-center shrink-0">HSN Code</div>
                        <div className="w-20 text-center shrink-0">GST Rate</div>
                        <div className="w-32 text-right pr-2 shrink-0">B1 (Stock)</div>
                        <div className="w-28 text-right shrink-0">Rate / Unit</div>
                      </div>

                      {/* Product items list */}
                      <div onScroll={handleProductScroll} className="flex-1 overflow-y-auto bg-[#eef6ff]">
                        {/* End of List button when search query is empty */}
                        {!searchQuery.trim() && (
                          <div
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleEndOfList(openRowId);
                            }}
                            className={`cursor-pointer py-1.5 px-4 transition-all flex items-center justify-between text-xs select-none ${
                              highlightProductIndex === -1
                                ? 'bg-[#f5a623] text-black font-extrabold shadow-xs'
                                : 'hover:bg-[#ddebfa] text-[#1e293b] font-bold'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs">♦</span>
                              <span>End of List</span>
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              highlightProductIndex === -1 ? 'bg-black text-white' : 'text-slate-500'
                            }`}>
                              Enter ↵
                            </span>
                          </div>
                        )}

                        {visibleProducts.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500 italic">
                            {selectedCategory
                              ? `No items found in category "${selectedCategory}" matching "${searchQuery}"`
                              : `No stock items match "${searchQuery}"`}
                          </div>
                        ) : (
                          visibleProducts.map((p: any) => {
                            const currentIndex = runningIdx++;
                            const isHighlighted = currentIndex === highlightProductIndex;
                            const isSelected = p.id === activeRow?.productId;
                            const uom = (p as any)?.tally_uom || (p as any)?.unit_of_measure || 'N';
                            const hsn = p.hsn || p.hsn_code || (p as any)?.hsnCode || '—';
                            const gst = p.gst_rate !== undefined ? p.gst_rate : 18;
                            const stockQty = p.current_stock !== undefined ? `${p.current_stock.toLocaleString()} ${uom}` : '—';
                            const rateStr = p.baseRate !== undefined ? `₹${Number(p.baseRate).toFixed(2)}` : '—';

                            return (
                              <div
                                key={p.id}
                                id={`stock-item-${currentIndex}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || 'B';
                                  updateRow(openRowId, { productId: p.id, billingMode: prodMode });
                                  setValidationErrors((prev: any) => { const n = { ...prev }; delete n[`row-${openRowId}-product`]; return n; });
                                  setOpenRowId(null);
                                  setSearchQuery('');
                                  setHighlightProductIndex(0);
                                  setTimeout(() => {
                                    setActiveDescRowId(openRowId);
                                  }, 60);
                                }}
                                className={`py-1.5 px-4 cursor-pointer transition-colors flex items-center justify-between text-xs select-none ${
                                  isHighlighted
                                    ? 'bg-[#f5a623] text-black font-extrabold shadow-xs'
                                    : isSelected
                                      ? 'bg-[#d8eafb] text-[#0f2942] font-bold'
                                      : 'hover:bg-[#ddebfa] text-[#1e293b]'
                                }`}
                              >
                                <div className="flex-1 min-w-0 pr-3">
                                  <div className="truncate font-bold leading-tight flex items-center gap-2">
                                    <span className="truncate text-xs">
                                      <HighlightMatch text={p.name} query={searchQuery} isHighlighted={isHighlighted} />
                                    </span>
                                    {p.category && (
                                      <button
                                        type="button"
                                        title={`Click to show only "${p.category}" items`}
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          const catVal = (p.category || '').trim();
                                          setSelectedCategory(selectedCategory?.toLowerCase() === catVal.toLowerCase() ? null : catVal);
                                          setHighlightProductIndex(0);
                                        }}
                                        className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded transition-colors shrink-0 ${
                                          isHighlighted
                                            ? 'bg-black/20 text-black hover:bg-black/30'
                                            : selectedCategory?.toLowerCase() === (p.category || '').trim().toLowerCase()
                                              ? 'bg-blue-600 text-white font-black'
                                              : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200'
                                        }`}
                                      >
                                        <HighlightMatch text={p.category} query={searchQuery} isHighlighted={isHighlighted} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className={`w-28 text-center font-mono text-[11px] shrink-0 ${isHighlighted ? 'text-black font-bold' : 'text-slate-600'}`}>
                                  <HighlightMatch text={String(hsn)} query={searchQuery} isHighlighted={isHighlighted} />
                                </div>
                                <div className={`w-20 text-center font-mono text-[11px] shrink-0 ${isHighlighted ? 'text-black font-bold' : 'text-slate-600'}`}>
                                  {gst}%
                                </div>
                                <div className={`w-32 text-right pr-2 font-mono text-[11px] shrink-0 ${isHighlighted ? 'text-black font-bold' : (p.current_stock < 0 ? 'text-red-600 font-bold' : 'text-slate-700')}`}>
                                  {stockQty}
                                </div>
                                <div className={`w-28 text-right font-bold text-[11px] shrink-0 ${isHighlighted ? 'text-black' : 'text-slate-800'}`}>
                                  {rateStr}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Footer shortcuts */}
                      <div className="bg-[#1a4a7a] text-white py-1 px-3 text-[10px] font-mono flex items-center justify-between border-t border-[#12365a] shrink-0 select-none">
                        <span>↑/↓ Navigate • ↵ Enter Select</span>
                        <span>Esc Close</span>
                      </div>
                    </>
                  );
                })()
              ) : null}
            </div>
          )}

    </RoleGuard>
  );
}
