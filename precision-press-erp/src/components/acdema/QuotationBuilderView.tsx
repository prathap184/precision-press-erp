'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Search, Upload, Printer, ChevronDown, Image as ImageIcon, Star, AlertTriangle, ExternalLink } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { INDIAN_STATES } from '@/lib/constants';
import { openTiffInSystem } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';

export function QuotationBuilderView({ vm }: { vm: any }) {
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
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [paymentMethodTab, setPaymentMethodTab] = useState<'CASH_UPI' | 'CREDIT'>('CASH_UPI');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const [rowUploading, setRowUploading] = useState<Record<string, boolean>>({});

  const handleRowFileSelect = async (rowId: string, file: File) => {
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
      if (!res.ok || !data.success || !data.fileUrl) {
        throw new Error(data.error || 'File upload failed');
      }

      // Save real server URL for universal opening, but keep clean fileName for display
      updateRow(rowId, { tiffPath: data.fileUrl, fileName: file.name });
      setValidationErrors((prev) => ({ ...prev, [`row-${rowId}-file`]: '' }));
      toast.success(`Selected: ${file.name}`);
    } catch (err: any) {
      console.error('File select error:', err);
      // Fallback: save file name directly
      updateRow(rowId, { tiffPath: file.name, fileName: file.name });
      toast.error(err.message || 'Saved file locally');
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
      if (!row.productId) errors[`row-${row.id}-product`] = 'Product required';
      if (!row.width || Number(row.width) <= 0) errors[`row-${row.id}-width`] = 'Width required';
      if (!row.height || Number(row.height) <= 0) errors[`row-${row.id}-height`] = 'Height required';
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

          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
            
            {/* Abstract Shapes */}
            <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
            <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
            <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
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
                      <Search size={16} className="text-slate-400 mr-2" />
                      <input
                        value={customerDropdownOpen ? customerSearch : (selectedCustomer?.displayName || selectedCustomer?.name || '')}
                        placeholder="Search customer..."
                        onChange={(e) => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch(e.target.value);
                        }}
                        onFocus={() => {
                          setCustomerDropdownOpen(true);
                          setCustomerSearch('');
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setCustomerDropdownOpen(false);
                            setCustomerSearch('');
                          }, 200);
                        }}
                        className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder-slate-400"
                      />
                      <ChevronDown size={16} className="text-slate-400 ml-2" />
                    </div>

                    {customerDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-2 w-full z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
                      >
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-xs italic text-slate-400">No matches found.</div>
                        ) : (
                          filteredCustomers.map((customer: any) => (
                            <div
                              key={customer.uid}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedCustomerId(customer.uid);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch('');
                              }}
                              className={`cursor-pointer border-b border-slate-100 p-3 hover:bg-slate-50 ${customer.uid === selectedCustomerId ? 'bg-slate-100' : ''}`}
                            >
                              <div className="text-sm font-bold text-slate-800">{customer.displayName || customer.name}</div>
                              <div className="text-xs text-slate-500">{customer.phone} • {customer.businessName}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  
                  {selectedCustomer && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-600 border border-slate-200">
                      {selectedCustomer.phone} • {selectedCustomer.businessName || 'No business'}
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
                      {((selectedCustomer?.addresses && selectedCustomer.addresses.length > 0) || selectedCustomer?.billing_address_line1 || selectedCustomer?.shipping_address_line1 || selectedCustomer?.address) ? (
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

                            {selectedCustomer?.addresses && selectedCustomer.addresses.map((addr: any) => {
                              const fullAddr = `${selectedCustomer.displayName || selectedCustomer.name} ${selectedCustomer.phone ? `(${selectedCustomer.phone})` : ''}\n${addr.houseNumber}, ${addr.roadName}\n${addr.city}, ${addr.state} - ${addr.pincode}`;
                              return (
                                <option key={addr.id} value={fullAddr}>
                                  {addr.houseNumber}, {addr.roadName}, {addr.city}, {addr.state} - {addr.pincode}
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
                        <th className="py-3 px-2">Project</th>
                        <th className="py-3 px-2 text-center">GST%</th>
                        <th className="py-3 px-2">Width</th>
                        <th className="py-3 px-2">Length</th>
                        <th className="py-3 px-2 text-center">Sq.Ft.</th>
                        <th className="py-3 px-2">Qty</th>
                        <th className="py-3 px-2">Rate/Sft</th>
                        <th className="py-3 px-2 text-center">Rate Per</th>
                        <th className="py-3 px-2">Finish</th>
                        <th className="py-3 px-2">File Path *</th>
                        <th className="py-3 px-2 text-right">Amount</th>
                        <th className="py-3 px-2 text-center">×</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row: any, index: number) => {
                        const product = products.find((item: any) => item.id === row.productId);
                        const w = Number(row.width) || 0;
                        const h = Number(row.height) || 0;
                        const q = Number(row.quantity) || 0;
                        const wFt = row.widthUnit === 'IN' ? w / 12 : w;
                        const hFt = row.heightUnit === 'IN' ? h / 12 : h;
                        const sqft = wFt * hFt;
                        const eyeletRate = row.eyeletType === 'METAL' ? product?.eyeletPricing?.metal || 0 : row.eyeletType === 'PLASTIC' ? product?.eyeletPricing?.plastic || 0 : 0;
                        const amount = calculateRowSubtotal({
                          width: wFt, height: hFt, quantity: q, rate: product?.baseRate || 0,
                          eyeletCount: row.eyeletType === 'NONE' ? 0 : q, eyeletRate,
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
                                        onChange={(e) => { setOpenRowId(row.id); setSearchQuery(e.target.value); }}
                                        onFocus={() => {
                                          setOpenRowId(row.id); setSearchQuery('');
                                        }}
                                        onBlur={() => setTimeout(() => { setOpenRowId(null); setSearchQuery(''); }, 160)}
                                        className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                      />
                                      <ChevronDown size={14} className="text-slate-400" />
                                    </div>
                                    {isOpen && (
                                      <div className="absolute left-0 top-full mt-1 w-[260px] z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                        {(() => {
                                          if (matched.length === 0) return <div className="p-3 text-xs text-slate-400 italic">No products found.</div>;
                                          
                                          const grouped = matched.slice(0, 50).reduce((acc: any, p: any) => {
                                            const cat = p.category || 'Uncategorized';
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(p);
                                            return acc;
                                          }, {});

                                          return Object.entries(grouped).map(([cat, prods]: [string, any]) => (
                                            <div key={cat}>
                                              <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                                {cat.replace(/_/g, ' ')}
                                              </div>
                                              {prods.map((p: any) => (
                                                <div 
                                                  key={p.id} 
                                                  onMouseDown={(e) => { e.preventDefault(); updateRow(row.id, { productId: p.id }); setOpenRowId(null); setSearchQuery(''); }} 
                                                  className="cursor-pointer border-b border-slate-50 p-3 pl-4 hover:bg-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center transition-colors"
                                                >
                                                  <span className="truncate pr-2">{p.name}</span>
                                                  <span className="text-[9px] font-black tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">{p.id}</span>
                                                </div>
                                              ))}
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
                              <input value={row.projectName || ''} onChange={(e) => updateRow(row.id, { projectName: e.target.value })} className="h-10 w-full min-w-[80px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none placeholder:text-slate-300" placeholder="Project" />
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{gstRate}</td>
                            <td className="py-3 px-2 tabular-nums">
                              <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                                <input id={`error-row-${row.id}-width`} value={row.width} onChange={(e) => updateRow(row.id, { width: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-width`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="W" />
                                <select value={row.widthUnit} onChange={(e) => updateRow(row.id, { widthUnit: e.target.value })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0"><option value="FT">ft</option><option value="IN">in</option></select>
                              </div>
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                                <input id={`error-row-${row.id}-height`} value={row.height} onChange={(e) => updateRow(row.id, { height: e.target.value })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-height`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="L" />
                                <select value={row.heightUnit} onChange={(e) => updateRow(row.id, { heightUnit: e.target.value })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0"><option value="FT">ft</option><option value="IN">in</option></select>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                              {sqft > 0 ? sqft.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <input id={`error-row-${row.id}-quantity`} value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} className={`h-10 w-16 rounded-lg border border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-800 outline-none ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-400' : ''}`} placeholder="Qty" />
                            </td>
                            <td className="py-3 px-2 text-xs font-bold text-slate-600 tabular-nums">
                              {product?.baseRate?.toFixed(2) || '—'}
                            </td>
                            <td className="py-3 px-2 text-center text-xs font-bold text-slate-700 tabular-nums">
                              {product?.baseRate ? (sqft * product.baseRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td className="py-3 px-2 tabular-nums">
                              <div className="flex flex-col gap-1">
                                <select value={row.eyeletType} onChange={(e) => updateRow(row.id, { eyeletType: e.target.value as any })} className="h-8 w-full min-w-[80px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none">
                                  <option value="NONE">None</option>
                                  <option value="METAL">Metal</option>
                                  <option value="PLASTIC">Plastic</option>
                                </select>
                              </div>
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
                                      onClick={() => openTiffInSystem(row.tiffPath)}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                      title="Open / View File"
                                    >
                                      <ExternalLink size={12} />
                                    </button>
                                  )}
                                </div>

                                <label
                                  className={`flex items-center justify-center gap-1 h-10 px-2.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-2xs ${
                                    rowUploading[row.id]
                                      ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-wait'
                                      : row.tiffPath
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                      : 'bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-blue-600'
                                  }`}
                                  title="Browse file from computer"
                                >
                                  {rowUploading[row.id] ? (
                                    <Loader2 size={12} className="animate-spin text-slate-500" />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  <span>{rowUploading[row.id] ? '...' : row.tiffPath ? 'Change' : 'Browse'}</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={rowUploading[row.id]}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleRowFileSelect(row.id, f);
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
