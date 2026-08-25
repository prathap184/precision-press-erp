'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Search, Upload, Printer, ChevronDown, Image as ImageIcon, Star, AlertTriangle, ExternalLink } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { INDIAN_STATES } from '@/lib/constants';
import { openTiffInSystem } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';

export function ProxyOrderBuilderView({ vm }: { vm: any }) {
  const {
    bootstrapLoading, profile, roles, customerSearch, setCustomerSearch,
    selectedCustomerId, setSelectedCustomerId, filteredCustomers,
    selectedCustomer, rows, addRow, updateRow, removeRow, products,
    calculateRowSubtotal, paymentMode, setPaymentMode, deliveryType,
    setDeliveryType, shippingAddress, setShippingAddress, upiUploading,
    upiPreview, upiProofUrl, handleUpload, showCreateCustomer,
    setShowCreateCustomer, creatingCustomer, createdCustomer,
    newCustomerForm, setNewCustomerForm, handleCreateCustomer,
    setTiffError, tiffError, notes, setNotes, summary, submitProxyOrder,
    loading, addingAddress, handleAddDeliveryAddress, applyVoucher, setApplyVoucher,
    verifyingGst, handleVerifyGst
  } = vm;

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightProductIndex, setHighlightProductIndex] = useState<number>(0);
  const [highlightCustomerIndex, setHighlightCustomerIndex] = useState<number>(0);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [paymentMethodTab, setPaymentMethodTab] = useState<'CASH_UPI' | 'CREDIT'>('CASH_UPI');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const [rowUploading, setRowUploading] = useState<Record<string, boolean>>({});

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
      if (showCreateCustomer) {
        setShowCreateCustomer(false);
        return;
      }
      setShowExitConfirmModal(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showExitConfirmModal) {
          e.preventDefault();
          e.stopPropagation();
          setShowExitConfirmModal(false);
          return;
        }
        if (customerDropdownOpen || openRowId || openUnitPickerId || showAddressModal || showCreditModal || showCreateCustomer) {
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
  }, [showExitConfirmModal, customerDropdownOpen, openRowId, openUnitPickerId, showAddressModal, showCreditModal, showCreateCustomer]);

  useEffect(() => {
    if (showAddressModal) {
      setOpenRowId(null);
      setCustomerDropdownOpen(false);
      const timer = setTimeout(() => {
        const firstModalInput = document.getElementById("modal-house-no");
        if (firstModalInput) {
          firstModalInput.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showAddressModal]);

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
  const creditExceeded = paymentMethodTab === 'CREDIT' && summary.grandTotal > creditAvailable;

  useEffect(() => {
    if (selectedCustomer?.customerType === 'CREDIT') {
      setPaymentMethodTab('CREDIT');
      setPaymentMode('CREDIT');
    } else {
      setPaymentMethodTab('CASH_UPI');
      setPaymentMode('HAND_CASH');
    }
  }, [selectedCustomerId, selectedCustomer?.customerType, setPaymentMode]);

  const validateAndSubmit = () => {
    const errors: Record<string, string> = {};
    if (!selectedCustomerId) errors['customer'] = 'Customer required';
      if (vm.mode !== 'quotation' && deliveryType !== 'selfPickup' && (!shippingAddress || shippingAddress === 'Self Pickup')) {
        errors['shippingAddress'] = 'Delivery address required';
      }
    if (rows.length === 0) errors['rows'] = 'At least one item required';
    rows.forEach((row: any) => {
      const product = products.find((p: any) => p.id === row.productId);
      const isDirect = (product as any)?.metadata?.isDirectSelling === true || (product as any)?.unit_of_measure === 'N' || product?.category === 'LED- SMPS';
      if (!row.productId) errors[`row-${row.id}-product`] = 'Product required';
      if (!isDirect) {
        if (!row.width || Number(row.width) <= 0) errors[`row-${row.id}-width`] = 'Width required';
        if (!row.height || Number(row.height) <= 0) errors[`row-${row.id}-height`] = 'Height required';
      }
      if (!row.quantity || Number(row.quantity) <= 0) errors[`row-${row.id}-quantity`] = 'Quantity required';
    });
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstErrorKey = Object.keys(errors)[0];
      const element = document.getElementById(`error-${firstErrorKey}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    
    if (paymentMethodTab === 'CREDIT') {
      setShowCreditModal(true);
    } else {
      submitProxyOrder();
    }
  };

  const [addressForm, setAddressForm] = useState({
    fullName: '', phone: '', pincode: '', state: '', stateCode: '', district: '', city: '', houseNo: '', roadName: '', area: '', addressType: 'Home'
  });

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
      <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none">
        <div className="w-full">
          
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">Order Terminal</h1>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Hindustan Enterprises</p>
            </div>
          </div>

          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-[#e2ecf8]">
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
            
            {/* Pure Soft Light Blue Ambient Orbs */}
            <div className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-sky-200/50 blur-[130px] pointer-events-none"></div>
            <div className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-200/40 blur-[130px] pointer-events-none"></div>
            <div className="absolute top-[35%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-sky-100/60 blur-[120px] pointer-events-none"></div>
          </div>

          <div className="flex flex-col gap-6">
            
            {/* Top Row: Image, Customer, Logistics */}
            <div className={`grid gap-6 grid-cols-1 ${vm.mode === 'quotation' ? 'lg:grid-cols-[1.5fr_2.5fr] xl:grid-cols-[1.5fr_3fr]' : 'lg:grid-cols-[1.5fr_2.5fr_2.5fr] xl:grid-cols-[1fr_2fr_2fr]'} items-stretch`}>
              {/* Image Card */}
              <div className="relative z-10 rounded-[2rem] bg-white/50 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center min-h-[200px]">
                <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white">
                  <img src={currentImage || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200'} className="absolute inset-0 w-full h-full object-cover" alt="Product preview" />
                </div>
              </div>

{/* Customer Card */}
                <div className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</h3>
                    <button onClick={() => setShowCreateCustomer(true)} className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700">
                      + New
                    </button>
                  </div>
                  
                  <div className="relative">
                    <div id="error-customer" className={`flex h-12 w-full items-center rounded-xl px-4 transition-all duration-150 ${validationErrors['customer'] ? 'border-2 border-red-500 bg-red-50/50' : customerDropdownOpen ? 'border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md' : 'border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                      <Search size={16} className={`mr-2 transition-colors ${customerDropdownOpen ? 'text-blue-600' : 'text-slate-400'}`} />
                      <input
                        value={customerDropdownOpen ? customerSearch : (selectedCustomer?.displayName || selectedCustomer?.name || '')}
                        placeholder="Search customer..."
                        data-dropdown-open={customerDropdownOpen ? "true" : "false"}
                        onChange={(e) => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch(e.target.value);
                          setHighlightCustomerIndex(0);
                        }}
                        onFocus={() => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch('');
                          setHighlightCustomerIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            if (!customerDropdownOpen) {
                              setCustomerDropdownOpen(true);
                              setHighlightCustomerIndex(0);
                              return;
                            }
                            setHighlightCustomerIndex((prev) => Math.min(prev + 1, filteredCustomers.length - 1));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlightCustomerIndex((prev) => Math.max(prev - 1, 0));
                          } else if (e.key === "Enter") {
                            if (customerDropdownOpen && filteredCustomers.length > 0) {
                              e.preventDefault();
                              const customer = filteredCustomers[highlightCustomerIndex] || filteredCustomers[0];
                              if (customer) {
                                setSelectedCustomerId(customer.uid || customer.id);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch('');
                                setHighlightCustomerIndex(0);
                                setTimeout(() => {
                                  if (vm.mode !== 'quotation') {
                                    const logisticsBtn = document.getElementById(`logistics-btn-${deliveryType}`) || document.getElementById('logistics-btn-door') || document.querySelector('[id^="logistics-btn-"]');
                                    if (logisticsBtn) {
                                      (logisticsBtn as HTMLElement).focus();
                                      return;
                                    }
                                  }
                                  const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                                  if (firstProductInput) firstProductInput.focus();
                                }, 60);
                              }
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
                      <ChevronDown size={16} className={`ml-2 transition-colors ${customerDropdownOpen ? 'text-blue-600' : 'text-slate-400'}`} />
                    </div>

                    {customerDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-2 w-full z-[9999] max-h-64 overflow-y-auto rounded-xl border-2 border-blue-600 bg-white shadow-2xl"
                      >
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-xs italic text-slate-400">No matches found.</div>
                        ) : (
                          filteredCustomers.map((customer: any, idx: number) => {
                            const isHighlighted = idx === highlightCustomerIndex;
                            return (
                              <div
                                key={customer.uid || customer.id}
                                ref={(el) => {
                                  if (el && isHighlighted) el.scrollIntoView({ block: 'nearest' });
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedCustomerId(customer.uid || customer.id);
                                  setCustomerDropdownOpen(false);
                                  setCustomerSearch('');
                                  setHighlightCustomerIndex(0);
                                  setTimeout(() => {
                                    if (vm.mode !== 'quotation') {
                                      const logisticsBtn = document.getElementById(`logistics-btn-${deliveryType}`) || document.getElementById('logistics-btn-door') || document.querySelector('[id^="logistics-btn-"]');
                                      if (logisticsBtn) {
                                        (logisticsBtn as HTMLElement).focus();
                                        return;
                                      }
                                    }
                                    const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                                    if (firstProductInput) firstProductInput.focus();
                                  }, 60);
                                }}
                                className={`cursor-pointer border-b border-slate-100 p-3 transition-colors ${
                                  isHighlighted
                                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                                    : (customer.uid === selectedCustomerId || customer.id === selectedCustomerId)
                                      ? 'bg-blue-50 text-blue-800 font-bold'
                                      : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className={`text-sm font-bold ${isHighlighted ? 'text-white' : 'text-slate-800'}`}>
                                  {customer.displayName || customer.name}
                                </div>
                                <div className={`text-xs ${isHighlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                                  {customer.phone || 'No phone'} • {customer.businessName || customer.billing_city || 'Mysore'}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  
                  {selectedCustomer && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-600 border border-slate-200">
                      {selectedCustomer.phone || 'No phone'} • {selectedCustomer.businessName || selectedCustomer.billing_city || 'Customer'}
                    </div>
                  )}
                </div>

                {/* Logistics Card */}
                {vm.mode !== 'quotation' && (
                <div className="relative z-40 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 h-full">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                  <div className="flex gap-2">
                    {[
                      { id: 'selfPickup', label: 'PICKUP', key: 'p' },
                      { id: 'door', label: 'DOOR', key: 'd' },
                      { id: 'courier', label: 'COURIER', key: 'c' },
                      { id: 'transport', label: 'TRANSPORT', key: 't' },
                    ].map((opt, optIdx, arr) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDeliveryType(opt.id as any)}
                        onKeyDown={(e) => {
                          const k = e.key.toLowerCase();
                          if (e.key === "ArrowRight") {
                            e.preventDefault();
                            const next = arr[(optIdx + 1) % arr.length];
                            setDeliveryType(next.id as any);
                            const nextBtn = document.getElementById(`logistics-btn-${next.id}`);
                            if (nextBtn) nextBtn.focus();
                          } else if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            const prev = arr[(optIdx - 1 + arr.length) % arr.length];
                            setDeliveryType(prev.id as any);
                            const prevBtn = document.getElementById(`logistics-btn-${prev.id}`);
                            if (prevBtn) prevBtn.focus();
                          } else if (k === 'p' || k === 'd' || k === 'c' || k === 't') {
                            const found = arr.find(item => item.key === k);
                            if (found) {
                              e.preventDefault();
                              setDeliveryType(found.id as any);
                              const targetBtn = document.getElementById(`logistics-btn-${found.id}`);
                              if (targetBtn) targetBtn.focus();
                            }
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (deliveryType !== 'selfPickup') {
                              const addrSelect = document.querySelector('select[value]') || document.getElementById('error-shippingAddress') || document.querySelector('.space-y-2 select');
                              if (addrSelect) {
                                (addrSelect as HTMLElement).focus();
                                return;
                              }
                            }
                            const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                            if (firstProductInput) firstProductInput.focus();
                          }
                        }}
                        id={`logistics-btn-${opt.id}`}
                        className={`flex-1 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all focus:ring-2 focus:ring-slate-400 focus:outline-none ${
                          deliveryType === opt.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {deliveryType !== 'selfPickup' && (
                    <div className="mt-4 space-y-2">
                      {((Array.isArray(selectedCustomer?.addresses) && selectedCustomer.addresses.length > 0) || selectedCustomer?.billing_address_line1 || selectedCustomer?.shipping_address_line1 || selectedCustomer?.address) ? (
                        <>
                          <select
                            id="delivery-address-select"
                            className="h-12 w-full rounded-lg border-2 border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all"
                            value={shippingAddress}
                            onChange={(e) => setShippingAddress(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const addAddrBtn = document.getElementById("add-address-btn");
                                if (addAddrBtn) {
                                  addAddrBtn.focus();
                                } else {
                                  const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                                  if (firstProductInput) firstProductInput.focus();
                                }
                              }
                            }}
                          >
                            <option value="">Select Delivery Address</option>
                            
                            {selectedCustomer?.billing_address_line1 && (
                              <option value={[selectedCustomer.billing_address_line1, selectedCustomer.billing_address_line2, selectedCustomer.billing_city, selectedCustomer.billing_state, selectedCustomer.billing_pincode].filter(Boolean).join(', ')}>
                                Primary: {[selectedCustomer.billing_address_line1, selectedCustomer.billing_address_line2, selectedCustomer.billing_city, selectedCustomer.billing_state, selectedCustomer.billing_pincode].filter(Boolean).join(', ')}
                              </option>
                            )}
                            
                            {selectedCustomer?.shipping_address_line1 && (
                              <option value={[selectedCustomer.shipping_address_line1, selectedCustomer.shipping_address_line2, selectedCustomer.shipping_city, selectedCustomer.shipping_state, selectedCustomer.shipping_pincode].filter(Boolean).join(', ')}>
                                Secondary: {[selectedCustomer.shipping_address_line1, selectedCustomer.shipping_address_line2, selectedCustomer.shipping_city, selectedCustomer.shipping_state, selectedCustomer.shipping_pincode].filter(Boolean).join(', ')}
                              </option>
                            )}

                            {Array.isArray(selectedCustomer?.addresses) && selectedCustomer.addresses.map((addr: any, idx: number) => {
                              const fullAddr = `${selectedCustomer.displayName || selectedCustomer.name} ${selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}\n${addr.houseNumber || ''}, ${addr.roadName || ''}\n${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`;
                              return (
                                <option key={addr.id || idx} value={fullAddr}>
                                  {addr.houseNumber || ''}, {addr.roadName || ''}, {addr.city || ''}, {addr.state || ''} - {addr.pincode || ''}
                                </option>
                              );
                            })}
                            {selectedCustomer?.address && <option value={selectedCustomer.address}>Legacy: {selectedCustomer.address}</option>}
                          </select>
                          {shippingAddress && shippingAddress !== 'Self Pickup' && (
                            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-xs font-semibold text-slate-600 whitespace-pre-line mt-2 text-left leading-relaxed">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Selected Delivery Address:</p>
                              {shippingAddress}
                            </div>
                          )}
                          <button
                            id="add-address-btn"
                            type="button"
                            onClick={() => setShowAddressModal(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const firstProductInput = document.querySelector('input[placeholder="Select item..."]') as HTMLElement;
                                if (firstProductInput) {
                                  firstProductInput.focus();
                                  try { (firstProductInput as HTMLInputElement).select(); } catch {}
                                }
                              } else if (e.key === " " || e.key === "Spacebar") {
                                e.preventDefault();
                                setShowAddressModal(true);
                              }
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-blue-500 mt-1 hover:underline cursor-pointer focus:ring-2 focus:ring-blue-400 focus:outline-none rounded px-1"
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
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setShowAddressModal(true);
                            }
                          }}
                          className={`flex h-12 w-full items-center justify-center rounded-xl border-2 border-dashed text-xs font-bold uppercase tracking-widest transition-all focus:ring-2 focus:ring-blue-400 focus:outline-none ${
                            validationErrors['shippingAddress'] ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          + Delivery Address
                        </button>
                      )}
                    </div>
                  )}
            </div>
                )}
                </div>
              </div>

            {/* Middle Row: Items Card (Full Width) */}
            <div className="w-full mt-6 mb-6">
              {/* Items Card */}
              <div className="relative z-10 w-full rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={addRow}
                    className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="flex-1 overflow-visible">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="py-3 px-2 w-8 text-center">#</th>
                        <th className="py-3 px-2">Name of Item</th>
                        <th className="py-3 px-2">Project <span className="normal-case font-normal text-slate-400 tracking-normal italic">(optional)</span></th>
                        <th className="py-3 px-2 text-center">GST%</th>
                        <th className="py-3 px-2">Width</th>
                        <th className="py-3 px-2">Length</th>
                        <th className="py-3 px-2 text-center">Sq.Ft.</th>
                        <th className="py-3 px-2">Qty</th>
                        <th className="py-3 px-2">Rate/Sft</th>
                        <th className="py-3 px-2 text-center">Rate Per</th>
                        <th className="py-3 px-2">Finish</th>
                        <th className="py-3 px-2">File Path <span className="normal-case font-normal text-slate-400 tracking-normal italic">(optional)</span></th>
                        <th className="py-3 px-2 text-right">Amount</th>
                        <th className="py-3 px-2 text-center">×</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row: any, index: number) => {
                        const product = products.find((item: any) => item.id === row.productId);
                        const isDirect = (product as any)?.metadata?.isDirectSelling === true || (product as any)?.unit_of_measure === 'N' || product?.category === 'LED- SMPS';
                        const w = Number(row.width) || 0;
                        const h = Number(row.height) || 0;
                        const q = Number(row.quantity) || 0;
                        const wFt = row.widthUnit === 'IN' ? w / 12 : w;
                        const hFt = row.heightUnit === 'IN' ? h / 12 : h;
                        const sqft = isDirect ? 0 : wFt * hFt;
                        const eyeletRate = isDirect ? 0 : (row.eyeletType === 'METAL' ? product?.eyeletPricing?.metal || 0 : row.eyeletType === 'PLASTIC' ? product?.eyeletPricing?.plastic || 0 : 0);
                        const amount = calculateRowSubtotal({
                          width: wFt, height: hFt, quantity: q, rate: product?.baseRate || 0,
                          eyeletCount: isDirect || row.eyeletType === 'NONE' ? 0 : q, eyeletRate,
                          isDirectSelling: isDirect,
                        });
                        const gstRate = product?.gst_rate || 18;

                        return (
                          <tr key={row.id} className="group transition-colors hover:bg-slate-50/50">
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-400 tabular-nums">{index + 1}</td>
                            <td className="py-3 px-2 tabular-nums">
                              {(() => {
                                const selProd = products.find((p: any) => p.id === row.productId);
                                const isOpen = openRowId === row.id;
                                const qTerm = searchQuery.trim().toLowerCase();
                                const matched = qTerm ? products.filter((p: any) => p.name.toLowerCase().includes(qTerm) || p.id.toString().toLowerCase().includes(qTerm)) : products;

                                return (
                                  <div id={`error-row-${row.id}-product`} className="relative w-full min-w-[140px]">
                                    <div className={`flex h-10 w-full items-center rounded-lg px-3 transition-all duration-150 ${validationErrors[`row-${row.id}-product`] ? 'border-2 border-red-400 bg-red-50/50' : isOpen ? 'border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-sm' : 'border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white'}`}>
                                      <input
                                        value={isOpen ? searchQuery : (selProd?.name ?? '')}
                                        placeholder="Select item..."
                                        data-dropdown-open={isOpen ? "true" : "false"}
                                        onChange={(e) => {
                                          setOpenRowId(row.id);
                                          setSearchQuery(e.target.value);
                                          setHighlightProductIndex(0);
                                        }}
                                        onFocus={() => {
                                          setOpenRowId(row.id);
                                          setSearchQuery('');
                                          setHighlightProductIndex(0);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            if (!isOpen) {
                                              setOpenRowId(row.id);
                                              setHighlightProductIndex(0);
                                              return;
                                            }
                                            setHighlightProductIndex((prev) => Math.min(prev + 1, Math.min(matched.length - 1, 49)));
                                          } else if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            setHighlightProductIndex((prev) => Math.max(prev - 1, 0));
                                          } else if (e.key === "Enter") {
                                            if (isOpen && matched.length > 0) {
                                              e.preventDefault();
                                              const p = matched[highlightProductIndex] || matched[0];
                                              if (p) {
                                                updateRow(row.id, { productId: p.id });
                                                setOpenRowId(null);
                                                setSearchQuery('');
                                                setHighlightProductIndex(0);
                                                setTimeout(() => {
                                                  const projectInput = document.querySelector(`input[value="${row.projectName || ''}"]`) as HTMLElement;
                                                  const widthInput = document.getElementById(`error-row-${row.id}-width`);
                                                  if (projectInput) projectInput.focus();
                                                  else if (widthInput) widthInput.focus();
                                                }, 60);
                                              }
                                            }
                                          }
                                        }}
                                        onBlur={() => setTimeout(() => { setOpenRowId(null); setSearchQuery(''); }, 160)}
                                        className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                      />
                                      <ChevronDown size={14} className={`cursor-pointer transition-colors ${isOpen ? 'text-blue-600' : 'text-slate-400'}`} onClick={() => setOpenRowId(isOpen ? null : row.id)} />
                                    </div>
                                    {isOpen && (
                                      <div className="absolute left-0 top-full mt-1 w-[280px] z-[9999] max-h-64 overflow-y-auto rounded-xl border-2 border-blue-600 bg-white shadow-2xl">
                                        {(() => {
                                          if (matched.length === 0) return <div className="p-3 text-xs text-slate-400 italic">No products found.</div>;
                                          
                                          const grouped = matched.slice(0, 50).reduce((acc: any, p: any) => {
                                            const cat = p.category || 'Uncategorized';
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(p);
                                            return acc;
                                          }, {});

                                          let runningIdx = 0;

                                          return Object.entries(grouped).map(([cat, prods]: [string, any]) => (
                                            <div key={cat}>
                                              <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                                {cat.replace(/_/g, ' ')}
                                              </div>
                                              {prods.map((p: any) => {
                                                const currentItemIdx = runningIdx++;
                                                const isHighlighted = currentItemIdx === highlightProductIndex;

                                                return (
                                                  <div 
                                                    key={p.id} 
                                                    ref={(el) => {
                                                      if (el && isHighlighted) {
                                                        el.scrollIntoView({ block: 'nearest' });
                                                      }
                                                    }}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault();
                                                      updateRow(row.id, { productId: p.id });
                                                      setOpenRowId(null);
                                                      setSearchQuery('');
                                                      setHighlightProductIndex(0);
                                                      setTimeout(() => {
                                                        const widthInput = document.getElementById(`error-row-${row.id}-width`);
                                                        if (widthInput) widthInput.focus();
                                                      }, 60);
                                                    }} 
                                                    className={`cursor-pointer border-b border-slate-100 p-2.5 pl-4 flex justify-between items-center transition-colors ${
                                                      isHighlighted
                                                        ? 'bg-blue-600 text-white font-extrabold shadow-sm'
                                                        : p.id === row.productId
                                                          ? 'bg-blue-50/80 text-blue-700 font-extrabold'
                                                          : 'hover:bg-slate-50 text-slate-700 font-bold'
                                                    }`}
                                                  >
                                                    <span className="truncate pr-2 text-xs">{p.name}</span>
                                                    <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                                                      isHighlighted ? 'bg-blue-700 text-white' : 'text-slate-400 bg-slate-100'
                                                    }`}>
                                                      {p.id}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ));
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <input value={row.projectName || ''} onChange={(e) => updateRow(row.id, { projectName: e.target.value })} className="h-10 w-full min-w-[80px] rounded-lg border-2 border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all" placeholder="Project (optional)" />
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{gstRate}</td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-10 w-[90px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className={`flex h-10 w-[90px] items-center rounded-lg border-2 bg-slate-50 px-1 overflow-visible transition-all focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white ${validationErrors[`row-${row.id}-width`] ? 'border-red-400 bg-red-50/50' : 'border-slate-200'}`}>
                                  <input id={`error-row-${row.id}-width`} value={row.width} onChange={(e) => updateRow(row.id, { width: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 transition-all ${validationErrors[`row-${row.id}-width`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="W" />
                                  <div className="relative flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setOpenUnitPickerId(openUnitPickerId === `${row.id}-w` ? null : `${row.id}-w`)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          if (openUnitPickerId === `${row.id}-w`) {
                                            setOpenUnitPickerId(null);
                                            setTimeout(() => {
                                              const heightInput = document.getElementById(`error-row-${row.id}-height`);
                                              if (heightInput) heightInput.focus();
                                            }, 50);
                                          } else {
                                            setOpenUnitPickerId(`${row.id}-w`);
                                          }
                                        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                          e.preventDefault();
                                          const nextUnit = row.widthUnit === 'FT' ? 'IN' : 'FT';
                                          updateRow(row.id, { widthUnit: nextUnit });
                                          setOpenUnitPickerId(`${row.id}-w`);
                                        }
                                      }}
                                      onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                                      className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                      {row.widthUnit === 'FT' ? 'ft' : 'in'}
                                      <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                                    </button>
                                    {openUnitPickerId === `${row.id}-w` && (
                                      <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                        {['FT', 'IN'].map(u => (
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
                                                if (heightInput) heightInput.focus();
                                              }, 50);
                                            }}
                                            className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                                              row.widthUnit === u
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                          >
                                            {u.toLowerCase()}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-10 w-[90px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className={`flex h-10 w-[90px] items-center rounded-lg border-2 bg-slate-50 px-1 overflow-visible transition-all focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white ${validationErrors[`row-${row.id}-height`] ? 'border-red-400 bg-red-50/50' : 'border-slate-200'}`}>
                                  <input id={`error-row-${row.id}-height`} value={row.height} onChange={(e) => updateRow(row.id, { height: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 transition-all ${validationErrors[`row-${row.id}-height`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="L" />
                                  <div className="relative flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setOpenUnitPickerId(openUnitPickerId === `${row.id}-h` ? null : `${row.id}-h`)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          if (openUnitPickerId === `${row.id}-h`) {
                                            setOpenUnitPickerId(null);
                                            setTimeout(() => {
                                              const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                              if (qtyInput) qtyInput.focus();
                                            }, 50);
                                          } else {
                                            setOpenUnitPickerId(`${row.id}-h`);
                                          }
                                        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                          e.preventDefault();
                                          const nextUnit = row.heightUnit === 'FT' ? 'IN' : 'FT';
                                          updateRow(row.id, { heightUnit: nextUnit });
                                          setOpenUnitPickerId(`${row.id}-h`);
                                        }
                                      }}
                                      onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                                      className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                      {row.heightUnit === 'FT' ? 'ft' : 'in'}
                                      <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                                    </button>
                                    {openUnitPickerId === `${row.id}-h` && (
                                      <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                        {['FT', 'IN'].map(u => (
                                          <button
                                            key={u}
                                            type="button"
                                            tabIndex={-1}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              updateRow(row.id, { heightUnit: u });
                                              setOpenUnitPickerId(null);
                                              setTimeout(() => {
                                                const qtyInput = document.getElementById(`error-row-${row.id}-quantity`);
                                                if (qtyInput) qtyInput.focus();
                                              }, 50);
                                            }}
                                            className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                                              row.heightUnit === u
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                          >
                                            {u.toLowerCase()}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                              {sqft > 0 ? sqft.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <input id={`error-row-${row.id}-quantity`} value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} className={`h-10 w-16 rounded-lg border-2 border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-400 bg-red-50/50' : ''}`} placeholder="Qty" />
                            </td>
                            <td className="py-3 px-2 text-xs font-bold text-slate-600 tabular-nums">
                              {product?.baseRate?.toFixed(2) || '—'}
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-700 tabular-nums">
                              {isDirect ? (product?.baseRate ? Number(product.baseRate).toFixed(2) : '—') : (product?.baseRate ? (sqft * product.baseRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-8 w-full min-w-[80px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <select value={row.eyeletType} onChange={(e) => updateRow(row.id, { eyeletType: e.target.value as any })} className="h-8 w-full min-w-[80px] rounded-lg border-2 border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white transition-all">
                                    <option value="NONE">None</option>
                                    <option value="METAL">Metal</option>
                                    <option value="PLASTIC">Plastic</option>
                                  </select>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <div className="flex items-center gap-1.5 min-w-[210px]">
                                <div className="relative flex-1">
                                  <input
                                    id={`error-row-${row.id}-file`}
                                    value={row.fileName || row.tiffPath || ''}
                                    onChange={(e) => {
                                      updateRow(row.id, { tiffPath: e.target.value, fileName: '' });
                                      setValidationErrors((prev: any) => ({ ...prev, [`row-${row.id}-file`]: '' }));
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
                                      onClick={async () => {
                                        if (row.blobUrl) {
                                          window.open(row.blobUrl, '_blank', 'noopener,noreferrer');
                                        } else if (/^https?:\/\//i.test(row.tiffPath) || row.tiffPath?.startsWith('/') || row.tiffPath?.startsWith('blob:')) {
                                          window.open(row.tiffPath, '_blank', 'noopener,noreferrer');
                                        } else {
                                          try {
                                            await navigator.clipboard.writeText(row.tiffPath);
                                          } catch {}
                                          const opened = await openTiffInSystem(row.tiffPath);
                                          if (opened) {
                                            toast.success('Opening file in system viewer...');
                                          } else {
                                            toast.success('Path copied to clipboard! Paste in File Explorer (Win+E).', { duration: 4000 });
                                          }
                                        }
                                      }}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                      title="Open / View File"
                                    >
                                      <ExternalLink size={12} />
                                    </button>
                                  )}
                                </div>

                                <label
                                  className={`flex items-center justify-center gap-1 h-10 px-2.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-2xs ${
                                    row.tiffPath
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                      : 'bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-blue-600'
                                  }`}
                                  title="Browse file from computer"
                                >
                                  <Upload size={12} />
                                  <span>{row.tiffPath ? 'Change' : 'Browse'}</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleRowFileSelect(row.id, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right text-sm font-black text-slate-900 tabular-nums">
                              {amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-2 text-center tabular-nums">
                              <button onClick={() => removeRow(row.id)} className="rounded-lg bg-rose-50 p-2 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 size={16} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Bottom Row: Payment Terminal */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5 lg:col-start-8">
                {/* Payment Terminal Card */}
                <div className="rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Payment Terminal</h3>
                  
                  {vm.mode !== 'quotation' && (
                    <>
                      {/* Top tabs */}
                      <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethodTab('CASH_UPI');
                        setPaymentMode('HAND_CASH');
                      }}
                      className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
                        paymentMethodTab === 'CASH_UPI'
                          ? 'bg-slate-900 text-white shadow-md'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      CASH
                    </button>
                    {selectedCustomer?.customerType === 'CREDIT' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethodTab('CREDIT');
                          setPaymentMode('CREDIT');
                        }}
                        className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
                          paymentMethodTab === 'CREDIT'
                            ? 'bg-slate-900 text-white shadow-md'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        CREDIT ACCOUNT
                      </button>
                    )}
                  </div>

                  {/* Cash/UPI/COD sub-buttons */}
                  {paymentMethodTab === 'CASH_UPI' && (
                    <div className="flex gap-1.5 p-1 bg-slate-100/60 rounded-xl mb-4 border border-slate-200/40">
                      {[
                        { id: 'HAND_CASH', label: 'CASH', key: 'c' },
                        { id: 'UPI', label: 'UPI', key: 'u' },
                        { id: 'BANK', label: 'BANK', key: 'b' },
                        { id: 'COD', label: 'COD', key: 'o' }
                      ].map((opt, optIdx, arr) => (
                        <button
                          key={opt.id}
                          type="button"
                          id={`pay-mode-btn-${opt.id}`}
                          onClick={() => setPaymentMode(opt.id as any)}
                          onKeyDown={(e) => {
                            const k = e.key.toLowerCase();
                            if (e.key === "ArrowRight") {
                              e.preventDefault();
                              const next = arr[(optIdx + 1) % arr.length];
                              setPaymentMode(next.id as any);
                              const nextBtn = document.getElementById(`pay-mode-btn-${next.id}`);
                              if (nextBtn) nextBtn.focus();
                            } else if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              const prev = arr[(optIdx - 1 + arr.length) % arr.length];
                              setPaymentMode(prev.id as any);
                              const prevBtn = document.getElementById(`pay-mode-btn-${prev.id}`);
                              if (prevBtn) prevBtn.focus();
                            } else if (k === 'c' || k === 'u' || k === 'b' || k === 'o') {
                              const found = arr.find(item => item.key === k);
                              if (found) {
                                e.preventDefault();
                                setPaymentMode(found.id as any);
                                const targetBtn = document.getElementById(`pay-mode-btn-${found.id}`);
                                if (targetBtn) targetBtn.focus();
                              }
                            }
                          }}
                          className={`flex-1 rounded-lg py-1.5 text-[9px] font-black uppercase tracking-wider transition-all focus:ring-2 focus:ring-slate-400 focus:outline-none ${
                            paymentMode === opt.id
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                              : 'text-slate-500 hover:bg-white/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {paymentMethodTab === 'CREDIT' && selectedCustomer?.customerType === 'CASH' && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-[11px] font-bold text-amber-800 flex items-start gap-1.5 leading-relaxed shadow-sm">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>Note: Customer account is set to CASH mode. Selecting CREDIT may require manual approval.</span>
                    </div>
                  )}

                  {paymentMethodTab === 'CREDIT' && selectedCustomer && (
                    <div className="mb-4">
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
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <div className="w-1 h-5 rounded-full bg-blue-500 flex-shrink-0" />
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-700 leading-tight">
                        Additional Notes
                        <span className="block text-[9px] font-semibold normal-case tracking-normal text-slate-400 mt-0.5">by consumer for order processing</span>
                      </label>
                    </div>
                    <textarea 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Specific color needs, hardware requirements, special instructions..."
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-xs h-20 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white font-semibold resize-none transition-all"
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

                  {/* Pricing Breakdown */}
                  <div className="space-y-3 mb-6">
                    {summary.items?.map((item: any, idx: number) => (
                      <div key={idx} className="pb-2 border-b border-slate-100">
                        <div className="flex justify-between text-sm font-semibold text-slate-700">
                          <span className="truncate pr-4">{item.name}</span>
                          <span>Rs. {item.baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {summary.igst > 0 ? (
                          <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                            <span>IGST ({item.gstRate * 100}%)</span>
                            <span>Rs. {item.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                              <span>CGST ({(item.gstRate * 100) / 2}%)</span>
                              <span>Rs. {item.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                              <span>SGST ({(item.gstRate * 100) / 2}%)</span>
                              <span>Rs. {item.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        )}
                        {item.finishAmount > 0 && (
                          <div className="flex justify-between text-[11px] font-medium text-emerald-600 mt-0.5">
                            <span>Finish</span>
                            <span>Rs. {item.finishAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {(() => {
                          const itemTotal = item.baseAmount + item.igst + item.cgst + item.sgst + item.finishAmount;
                          return (
                            <div className="flex justify-between text-[11px] font-bold text-slate-700 mt-1.5 pt-1.5 border-t border-slate-100">
                              <span>Item Total</span>
                              <span>Rs. {itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })()}
                      </div>
                    ))}

                    {summary.deliveryCharges > 0 && (
                      <div className="pb-2 border-b border-slate-100">
                        <div className="flex justify-between text-sm font-semibold text-slate-700">
                          <span>Logistics</span>
                          <span>Rs. {summary.deliveryCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                    
                    {summary.voucherApplied && (
                      <div className="pb-2 border-b border-slate-100">
                        <div className="flex justify-between text-emerald-600 font-extrabold">
                          <span>Voucher Discount</span>
                          <span>- Rs. {summary.voucherGstDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4 pt-2 border-t border-slate-200">
                      <div className="flex justify-between text-2xl font-black text-slate-900">
                        <span>Grand Total</span>
                        <span>Rs. {summary.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Confirmation Checkbox */}
                  <div className="mb-4">
                    <label className="flex items-start gap-3 cursor-pointer group hover:bg-white/50 p-2 rounded-xl transition-all">
                      <input 
                        type="checkbox" 
                        id="confirm-dimensions"
                        checked={acceptTerms} 
                        onChange={(e) => setAcceptTerms(e.target.checked)} 
                        className="mt-0.5 rounded-[4px] border-slate-300 text-emerald-500 w-4 h-4 shadow-sm" 
                      />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-snug group-hover:text-slate-800 transition-all">
                        CONFIRM DIMENSIONS MATCH INDUSTRIAL SPECS & ARTWORK IS FINAL.
                      </span>
                    </label>
                  </div>

                  {/* Warning hint */}
                  {!acceptTerms && (
                    <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest text-center mb-3">
                      ⚠ TICK CONFIRMATION CHECKBOX TO ENABLE
                    </p>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={validateAndSubmit}
                    disabled={loading || upiUploading || !acceptTerms || creditExceeded}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/25 hover:bg-[#00a892] disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none transition-all"
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
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
            >
              <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Add Delivery Address</h3>
                  <button type="button" tabIndex={-1} onClick={() => setShowAddressModal(false)} className="text-slate-400 hover:text-slate-900">✕</button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input id="modal-house-no" placeholder="House No." value={addressForm.houseNo} onChange={(e) => setAddressForm(f => ({ ...f, houseNo: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none md:col-span-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <input id="modal-road-name" placeholder="Road Name" value={addressForm.roadName} onChange={(e) => setAddressForm(f => ({ ...f, roadName: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none md:col-span-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <input id="modal-area" placeholder="Area / Locality" value={addressForm.area} onChange={(e) => setAddressForm(f => ({ ...f, area: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <input id="modal-city" placeholder="City" value={addressForm.city} onChange={(e) => setAddressForm(f => ({ ...f, city: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <input id="modal-district" placeholder="District" value={addressForm.district} onChange={(e) => setAddressForm(f => ({ ...f, district: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <select id="modal-state" value={addressForm.state} onChange={(e) => setAddressForm(f => ({ ...f, state: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none appearance-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                    <option value="" disabled>Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input id="modal-state-code" placeholder="State Code" value={addressForm.stateCode} onChange={(e) => setAddressForm(f => ({ ...f, stateCode: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
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
                      }
                    }}
                    className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="mt-8 flex gap-3">
                  <button type="button" onClick={() => setShowAddressModal(false)} className="h-12 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                  <button
                    id="modal-save-address-btn"
                    type="submit"
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
                            try { (firstProductInput as HTMLInputElement).select(); } catch {}
                          }
                        }, 120);
                      }
                    }}
                    disabled={addingAddress}
                    className="h-12 flex-1 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {addingAddress ? 'Saving...' : 'Save Address'}
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

    </RoleGuard>
  );
}
