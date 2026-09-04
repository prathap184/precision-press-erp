'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Search, Upload, Printer, ChevronDown, Image as ImageIcon, Star, AlertTriangle, ExternalLink } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { INDIAN_STATES } from '@/lib/constants';
import { openTiffInSystem } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';

export function QuotationBuilderView({ vm }: { vm: any }) {
  const {
    bootstrapLoading, profile, roles, customerSearch, setCustomerSearch, customerSearching,
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
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [paymentMethodTab, setPaymentMethodTab] = useState<'CASH_UPI' | 'CREDIT'>('CASH_UPI');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const [rowUploading, setRowUploading] = useState<Record<string, boolean>>({});

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
    if (deliveryType !== 'selfPickup' && (!shippingAddress || shippingAddress === 'Self Pickup')) {
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
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1.5fr_2.5fr_2.5fr] xl:grid-cols-[1fr_2fr_2fr] items-stretch">
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
                    <div id="error-customer" className={`flex h-12 w-full items-center rounded-xl bg-slate-50 px-4 transition-all ${validationErrors['customer'] ? 'border-2 border-red-500' : 'border border-slate-200 focus-within:border-slate-400'}`}>
                      {customerSearching ? (
                        <Loader2 size={16} className="text-blue-600 animate-spin mr-2 shrink-0" />
                      ) : (
                        <Search size={16} className="text-slate-400 mr-2 shrink-0" />
                      )}
                      <input
                        value={customerSearch !== '' ? customerSearch : (selectedCustomer?.displayName || selectedCustomer?.name || '')}
                        placeholder="Search customer by name, phone, GSTIN..."
                        data-dropdown-open={customerDropdownOpen ? "true" : "false"}
                        onChange={(e) => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch(e.target.value);
                          setHighlightCustomerIndex(0);
                        }}
                        onFocus={(e) => {
                          setCustomerDropdownOpen(true);
                          if (selectedCustomer) {
                            setCustomerSearch(selectedCustomer.displayName || selectedCustomer.name || '');
                            e.target.select();
                          } else {
                            setCustomerSearch('');
                          }
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
                      <ChevronDown size={16} className="text-slate-400 ml-2 shrink-0" />
                    </div>

                    {customerDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-2 w-full z-[9999] max-h-64 overflow-y-auto rounded-xl border-2 border-slate-900 bg-white shadow-2xl divide-y divide-slate-100"
                      >
                        {customerSearching && (
                          <div className="px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50/70 flex items-center gap-2">
                            <Loader2 size={13} className="animate-spin" /> Searching server contacts database...
                          </div>
                        )}
                        {filteredCustomers.length === 0 && !customerSearching ? (
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
                <div className="relative z-40 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 h-full">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                  <div className="flex gap-2">
                    {[
                      { id: 'selfPickup', label: 'PICKUP' },
                      { id: 'door', label: 'DOOR' },
                      { id: 'courier', label: 'COURIER' },
                      { id: 'transport', label: 'TRANSPORT' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDeliveryType(opt.id as any)}
                        className={`flex-1 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
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
                            className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none focus:border-slate-400"
                            value={shippingAddress}
                            onChange={(e) => setShippingAddress(e.target.value)}
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
                          <button onClick={() => setShowAddressModal(true)} className="text-[10px] font-black uppercase tracking-widest text-blue-500 mt-1 hover:underline">
                            + Add Address
                          </button>
                        </>
                      ) : (
                        <button
                          id="error-shippingAddress"
                          onClick={() => setShowAddressModal(true)}
                          className={`flex h-12 w-full items-center justify-center rounded-xl border-2 border-dashed text-xs font-bold uppercase tracking-widest transition-all ${
                            validationErrors['shippingAddress'] ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          + Delivery Address
                        </button>
                      )}
                    </div>
                  )}
            </div>
                </div>
              </div>

            {/* Middle Row: Items Card (Full Width) */}
            <div className="w-full mt-6 mb-6">
              {/* Items Card */}
              <div className="relative z-10 w-full rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                  <button onClick={addRow} className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors">
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="flex-1 overflow-visible">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="py-3 px-2 w-8 text-center">#</th>
                        <th className="py-3 px-2">Name of Item</th>
                        <th className="py-3 px-2 text-center">HSN Code</th>
                        <th className="py-3 px-2 text-center">GST %</th>
                        <th className="py-3 px-2 text-center">T</th>
                        <th className="py-3 px-2">Width</th>
                        <th className="py-3 px-2">Length</th>
                        <th className="py-3 px-2 text-center">Sq. Ft.</th>
                        <th className="py-3 px-2 text-center">Pcs/No</th>
                        <th className="py-3 px-2 text-center">Quantity</th>
                        <th className="py-3 px-2 text-center">Rate/SqFt</th>
                        <th className="py-3 px-2 text-center">Rate per</th>
                        <th className="py-3 px-2">Finish</th>
                        <th className="py-3 px-2">File Path *</th>
                        <th className="py-3 px-2 text-right">Amount</th>
                        <th className="py-3 px-2 text-center">×</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row: any, index: number) => {
                        const product = products.find((item: any) => item.id === row.productId);
                        const isDirect = (product as any)?.metadata?.isDirectSelling === true || (product as any)?.unit_of_measure === 'N' || (product as any)?.tally_uom === 'N' || product?.category === 'LED- SMPS';
                        const defaultMode = (product as any)?.tally_billing_mode || (isDirect ? 'A' : 'B');
                        const currentMode = row.billingMode || defaultMode;
                        const w = Number(row.width) || 0;
                        const h = Number(row.height) || 0;
                        const pcs = Math.max(1, Number(row.pcsNo || row.quantity) || 1);
                        const wFt = row.widthUnit === 'IN' ? w / 12 : w;
                        const hFt = row.heightUnit === 'IN' ? h / 12 : h;
                        const sqft = isDirect ? 0 : wFt * hFt;
                        const totalBilledSqft = sqft * pcs;
                        const baseRate = Number(product?.baseRate) || 0;
                        const eyeletRate = isDirect ? 0 : (row.eyeletType === 'METAL' ? product?.eyeletPricing?.metal || 0 : row.eyeletType === 'PLASTIC' ? product?.eyeletPricing?.plastic || 0 : 0);
                        const amount = calculateRowSubtotal({
                          width: wFt, height: hFt, quantity: pcs, rate: baseRate,
                          eyeletCount: isDirect || row.eyeletType === 'NONE' ? 0 : pcs, eyeletRate,
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
                                    <div className={`flex h-10 w-full items-center rounded-lg bg-slate-50 px-3 border ${validationErrors[`row-${row.id}-product`] ? 'border-red-400' : 'border-slate-200'}`}>
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
                                            e.preventDefault();
                                            if (isOpen && matched.length > 0) {
                                              const selectedProduct = matched[highlightProductIndex] || matched[0];
                                              if (selectedProduct) {
                                                const isDirect = (selectedProduct as any)?.metadata?.isDirectSelling === true || (selectedProduct as any)?.unit_of_measure === 'N' || (selectedProduct as any)?.tally_uom === 'N' || selectedProduct?.category === 'LED- SMPS';
                                                const prodMode = (selectedProduct as any)?.tally_billing_mode || (selectedProduct as any)?.tallyBillingMode || (isDirect ? 'A' : 'B');
                                                updateRow(row.id, { productId: selectedProduct.id, billingMode: prodMode });
                                                setOpenRowId(null);
                                                setSearchQuery('');
                                                setHighlightProductIndex(0);
                                                setTimeout(() => {
                                                  const widthInput = document.getElementById(`error-row-${row.id}-width`);
                                                  if (widthInput) widthInput.focus();
                                                }, 60);
                                              }
                                            }
                                          } else if (e.key === "Escape") {
                                            setOpenRowId(null);
                                          }
                                        }}
                                        className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                      />
                                      <ChevronDown size={14} className="text-slate-400 cursor-pointer" onClick={() => setOpenRowId(isOpen ? null : row.id)} />
                                    </div>
                                    {isOpen && (
                                      <div className="absolute left-0 top-full mt-1 w-[280px] z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
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
                                                      const isDirect = (p as any)?.metadata?.isDirectSelling === true || (p as any)?.unit_of_measure === 'N' || (p as any)?.tally_uom === 'N' || p?.category === 'LED- SMPS';
                                                      const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || (isDirect ? 'A' : 'B');
                                                      updateRow(row.id, { productId: p.id, billingMode: prodMode });
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
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-500 tabular-nums">
                              {product?.hsn || product?.hsn_code || row.hsnCode || '—'}
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{gstRate}</td>
                            <td className="py-3 px-2 text-center tabular-nums">
                              {isDirect ? (
                                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-black border border-blue-200">
                                  {currentMode}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextMode = currentMode === 'A' ? 'B' : 'A';
                                    updateRow(row.id, { billingMode: nextMode });
                                  }}
                                  title="Click to toggle Mode A (Pieces) or Mode B (Sq.Ft)"
                                  className={`h-8 min-w-[58px] px-2 rounded-lg border-2 font-black text-xs transition-all inline-flex items-center justify-center gap-1 shadow-sm cursor-pointer ${
                                    currentMode === 'A'
                                      ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500/20'
                                      : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/20'
                                  }`}
                                >
                                  <span className="text-sm font-extrabold">{currentMode}</span>
                                  <span className="text-[9px] font-bold opacity-90">{currentMode === 'A' ? 'Pcs' : 'SqFt'}</span>
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-10 w-[80px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                                  <input id={`error-row-${row.id}-width`} value={row.width} onChange={(e) => updateRow(row.id, { width: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-width`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="W" />
                                  <select tabIndex={-1} value={row.widthUnit} onChange={(e) => updateRow(row.id, { widthUnit: e.target.value })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0"><option value="FT">ft</option><option value="IN">in</option></select>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-10 w-[80px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                                  <input id={`error-row-${row.id}-height`} value={row.height} onChange={(e) => updateRow(row.id, { height: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-height`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="L" />
                                  <select tabIndex={-1} value={row.heightUnit} onChange={(e) => updateRow(row.id, { heightUnit: e.target.value })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0"><option value="FT">ft</option><option value="IN">in</option></select>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                              {sqft > 0 ? sqft.toFixed(2) : '—'}
                            </td>
                            {/* Pcs/No Column */}
                            <td className="py-3 px-2 tabular-nums text-center">
                              {currentMode === 'B' ? (
                                <input
                                  id={`error-row-${row.id}-pcs`}
                                  value={row.pcsNo ?? row.quantity ?? '1'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateRow(row.id, { pcsNo: val, quantity: val });
                                  }}
                                  className={`h-10 w-16 rounded-lg border text-center text-xs font-bold ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-400' : 'border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-blue-600 focus:bg-white'}`}
                                  placeholder="Pcs"
                                />
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                            {/* Quantity Column */}
                            <td className="py-3 px-2 text-center text-xs font-bold tabular-nums">
                              {currentMode === 'B' ? (
                                <span className="text-slate-800 font-bold">{totalBilledSqft > 0 ? `${totalBilledSqft.toFixed(3)} sqft` : '—'}</span>
                              ) : (
                                <div className="inline-flex items-center justify-center">
                                  <input
                                    id={`error-row-${row.id}-quantity`}
                                    value={row.quantity || row.pcsNo || '1'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateRow(row.id, { quantity: val, pcsNo: val });
                                    }}
                                    className={`h-10 w-16 rounded-lg border text-center text-xs font-bold ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-400' : 'border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-blue-600 focus:bg-white'}`}
                                    placeholder="Qty"
                                  />
                                  <span className="ml-1 text-[11px] font-black text-slate-500">{(product as any)?.tally_uom || 'N'}</span>
                                </div>
                              )}
                            </td>
                            {/* Rate/SqFt Column */}
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-700 tabular-nums">
                              {currentMode === 'B' ? (baseRate > 0 ? baseRate.toFixed(2) : '—') : '—'}
                            </td>
                            {/* Rate per Column */}
                            <td className="py-3 px-2 text-center text-xs font-bold tabular-nums">
                              {currentMode === 'B' ? (
                                <span className="text-emerald-700 font-bold">{baseRate.toFixed(2)} sqft</span>
                              ) : (
                                <span className="text-blue-700 font-bold">{baseRate.toFixed(2)} {(product as any)?.tally_uom || 'N'}</span>
                              )}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              {isDirect ? (
                                <div className="h-8 w-full min-w-[80px] flex items-center justify-center text-slate-400 bg-slate-100/60 rounded-lg border border-dashed border-slate-200 text-xs font-bold font-mono">
                                  —
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <select value={row.eyeletType} onChange={(e) => updateRow(row.id, { eyeletType: e.target.value as any })} className="h-8 w-full min-w-[80px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none">
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
                                      const cleaned = sanitizeTiffPath(e.target.value);
                                      updateRow(row.id, { tiffPath: cleaned, fileName: '' });
                                      setValidationErrors((prev: any) => ({ ...prev, [`row-${row.id}-file`]: '' }));
                                    }}
                                    className={`h-10 w-full rounded-lg border pl-2.5 pr-7 font-mono text-[10px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all ${
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

            {/* Bottom Row: Summary Card */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5 lg:col-start-8">
                {/* Summary Card */}
                <div className="rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Order Summary</h3>
                  {/* Special Notes block */}
                  <div className="mb-4">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">SPECIAL NOTES</label>
                    <textarea 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Specific color needs, hardware requirements..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs h-20 outline-none focus:border-slate-400 font-semibold resize-none transition-all"
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
                    onClick={vm.submitQuotation}
                    disabled={vm.loading || !acceptTerms}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/25 hover:bg-[#00a892] disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none transition-all"
                  >
                    {vm.loading ? <Loader2 className="animate-spin" size={18} /> : null}
                    SEND QUOTATION
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900">Add Delivery Address</h3>
                  <button onClick={() => setShowAddressModal(false)} className="text-slate-400 hover:text-slate-900">✕</button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <input placeholder="House No." value={addressForm.houseNo} onChange={(e) => setAddressForm(f => ({ ...f, houseNo: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none md:col-span-2" />
                  <input placeholder="Road Name" value={addressForm.roadName} onChange={(e) => setAddressForm(f => ({ ...f, roadName: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none md:col-span-2" />
                  <input placeholder="Area / Locality" value={addressForm.area} onChange={(e) => setAddressForm(f => ({ ...f, area: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
                  <input placeholder="City" value={addressForm.city} onChange={(e) => setAddressForm(f => ({ ...f, city: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
                  <input placeholder="District" value={addressForm.district} onChange={(e) => setAddressForm(f => ({ ...f, district: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
                  <select value={addressForm.state} onChange={(e) => setAddressForm(f => ({ ...f, state: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none appearance-none cursor-pointer">
                    <option value="" disabled>Select State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input placeholder="State Code" value={addressForm.stateCode} onChange={(e) => setAddressForm(f => ({ ...f, stateCode: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
                  <input placeholder="Pincode" value={addressForm.pincode} onChange={(e) => setAddressForm(f => ({ ...f, pincode: e.target.value }))} className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
                </div>
                <div className="mt-8 flex gap-3">
                  <button onClick={() => setShowAddressModal(false)} className="h-12 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                  <button onClick={async () => {
                    const success = await handleAddDeliveryAddress({
                      pincode: addressForm.pincode, state: addressForm.state, stateCode: addressForm.stateCode, district: addressForm.district, city: addressForm.city, houseNumber: addressForm.houseNo, roadName: addressForm.roadName, area: addressForm.area
                    });
                    if (success) setShowAddressModal(false);
                  }} disabled={addingAddress} className="h-12 flex-1 rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
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

    </RoleGuard>
  );
}
