'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { Product } from '@/types/models';
import { UserProfile } from '@/types/auth';
import { getCustomers } from '@/lib/actions/users';
import { createCustomer } from '@/lib/actions/users';
import { getCachedProductsList as getProducts } from '@/lib/cache/products';
import { calculateRowSubtotal, calculateOrderSummary } from '@/lib/pricing-engine';
import { createStandaloneQuotation } from '@/lib/actions/quotations';
import { refreshAuthTokenCookie } from '@/lib/refresh-auth-token';
import { QuotationBuilderView } from '@/components/acdema/QuotationBuilderView';

type PaymentMode = 'HAND_CASH' | 'COD' | 'UPI' | 'CREDIT';
type DeliveryType = 'selfPickup' | 'door' | 'courier' | 'transport';

interface AcdemaRow {
  id: string;
  productId: string;
  productName: string;
  projectName: string;
  hsnCode: string;
  pcsNo: string;
  width: string;
  widthUnit: 'FT' | 'IN';
  height: string;
  heightUnit: 'FT' | 'IN';
  quantity: string;
  eyeletType: 'METAL' | 'PLASTIC' | 'NONE';
  eyeletCount: number;
  tiffPath: string;
}

const makeRow = (product?: Product): AcdemaRow => ({
  id: Math.random().toString(36).slice(2, 10),
  productId: product?.id || '',
  productName: product?.name || '',
  projectName: '',
  hsnCode: '',
  pcsNo: '',
  width: '',
  widthUnit: 'FT',
  height: '',
  heightUnit: 'FT',
  quantity: '1',
  eyeletType: 'NONE',
  eyeletCount: 0,
  tiffPath: '',
});

export function QuotationBuilder() {
  const router = useRouter();
  const { profile, roles } = useAuth();

  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [rows, setRows] = useState<AcdemaRow[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('HAND_CASH');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('door');
  const [shippingAddress, setShippingAddress] = useState('');
  const [upiProofUrl, setUpiProofUrl] = useState('');
  const [upiPreview, setUpiPreview] = useState('');
  const [upiUploading, setUpiUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [tiffError, setTiffError] = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptRemarks, setReceiptRemarks] = useState('');
  const [verifyingGst, setVerifyingGst] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<{ email: string; password: string; name: string } | null>(null);
  const [newCustomerForm, setNewCustomerForm] = useState({
    businessName: '',
    email: '',
    phone: '',
    houseNumber: '',
    roadName: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    gstType: 'Unregistered' as 'Regular' | 'Composition' | 'Unregistered',
    gstNumber: '',
    gstVerified: false,
    gstDetails: null as any,
    customerType: 'CASH' as 'CASH' | 'CREDIT',
    creditLimit: 0,
    voucherType: 'Type 0' as 'Type 0' | 'Type 1',
    tempPassword: `PP-${Math.floor(Math.random() * 90000) + 10000}`,
  });

  const handleVerifyGst = async () => {
    if (!newCustomerForm.gstNumber || newCustomerForm.gstNumber.trim().length !== 15) {
      toast.error('Please enter a valid 15-character GSTIN');
      return;
    }

    setVerifyingGst(true);
    try {
      const res = await fetch('/api/gst-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: newCustomerForm.gstNumber.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify GSTIN');
      }

      setNewCustomerForm((f) => {
        const nextForm = { ...f, businessName: data.data?.legalName || data.data?.tradeName || f.businessName };
        if (data.data?.address) {
          const parts = data.data.address.split(',').map((p: string) => p.trim());
          if (parts.length > 0) {
            nextForm.state = parts.find((p: string) => /karnataka|kerala|tamil/i.test(p)) || nextForm.state;
            nextForm.pincode = parts.find((p: string) => /^\d{6}$/.test(p)) || nextForm.pincode;
            nextForm.roadName = data.data.address;
          }
        }
        return { ...nextForm, gstVerified: true, gstDetails: data.data };
      });

      toast.success('GST Verified! Details auto-filled.');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Verification failed');
    } finally {
      setVerifyingGst(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const [productData, customerData] = await Promise.all([getProducts(), getCustomers()]);
        if (!active) return;

        const activeProducts = productData.filter((product: Product) => product.status === 'ACTIVE');
        setProducts(activeProducts);
        setCustomers(customerData);
        setRows([makeRow(activeProducts[0])]);
      } catch (error) {
        console.error(error);
        toast.error('Unable to load quotation data.');
      } finally {
        if (active) setBootstrapLoading(false);
      }
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => {
      return [customer.name, customer.displayName, customer.phone, customer.businessName, customer.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [customerSearch, customers]);

  const selectedCustomer = customers.find((customer) => (customer.uid === selectedCustomerId || (customer as any).id === selectedCustomerId)) || null;

  const [applyVoucher, setApplyVoucher] = useState(false);

  useEffect(() => {
    if (!selectedCustomer) return;

    if (deliveryType === 'selfPickup') {
      setShippingAddress('Self Pickup');
      return;
    }

    if ((selectedCustomer as any).shipping_address_line1) {
      const cust = selectedCustomer as any;
      const parts = [
        cust.shipping_address_line1,
        cust.shipping_address_line2,
        cust.shipping_area,
        cust.shipping_city,
        cust.shipping_district,
        cust.shipping_state,
        cust.shipping_pincode
      ].filter(Boolean);
      setShippingAddress(parts.join(', '));
    } else if ((selectedCustomer as any).billing_address_line1) {
      const cust = selectedCustomer as any;
      const parts = [
        cust.billing_address_line1,
        cust.billing_address_line2,
        cust.billing_area,
        cust.billing_city,
        cust.billing_district,
        cust.billing_state,
        cust.billing_pincode
      ].filter(Boolean);
      setShippingAddress(parts.join(', '));
    } else if (Array.isArray(selectedCustomer.addresses) && selectedCustomer.addresses.length > 0) {
      const a = selectedCustomer.addresses[selectedCustomer.addresses.length - 1];
      const parts = [
        a.houseNumber,
        a.roadName,
        (a as any).area,
        a.city,
        (a as any).district,
        a.state,
        a.pincode
      ].filter(Boolean);
      setShippingAddress(parts.join(', '));
    } else if (selectedCustomer.address) {
      setShippingAddress(selectedCustomer.address);
    }
    
    setApplyVoucher(false);
  }, [selectedCustomer, deliveryType]);

  const summary = useMemo(() => {
    const firstProduct = products.find(p => p.id === rows[0]?.productId);
    const dCharge = deliveryType === 'selfPickup' ? 0 : (firstProduct?.deliveryPricing?.[deliveryType] || 0);

    const isInterstate = (() => {
      if (deliveryType === 'selfPickup') return false;
      if (!shippingAddress) return false;
      const addr = shippingAddress.toLowerCase();
      if (addr.includes('karnataka')) return false;
      if (/\bka\b/.test(addr)) return false;
      return true;
    })();

    const pricingRows = rows.map((row) => {
      const product = products.find((item) => item.id === row.productId);
      const width = Number(row.width) || 0;
      const height = Number(row.height) || 0;
      const quantity = Number(row.quantity) || 0;
      const rate = product?.baseRate || 0;
      const eyeletRate = row.eyeletType === 'METAL'
        ? product?.eyeletPricing?.metal || 0
        : row.eyeletType === 'PLASTIC'
          ? product?.eyeletPricing?.plastic || 0
          : 0;
          
      return {
        name: product?.name || 'Unknown Item',
        width: row.widthUnit === 'IN' ? width / 12 : width,
        height: row.heightUnit === 'IN' ? height / 12 : height,
        quantity,
        rate,
        eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
        eyeletRate,
        gstRate: (product?.gst_rate || 18) / 100,
      };
    });

    const calculatedSummary = calculateOrderSummary(pricingRows, dCharge, 0.18, isInterstate);

    const items = pricingRows.map((row) => {
      const bAmount = row.width * row.height * row.quantity * row.rate;
      const fAmount = row.eyeletCount * row.eyeletRate;
      const sub = bAmount + fAmount;
      const itemGst = sub * row.gstRate;
      const c = isInterstate ? 0 : Number((itemGst / 2).toFixed(2));
      const s = isInterstate ? 0 : Number((itemGst / 2).toFixed(2));
      const i = isInterstate ? Number(itemGst.toFixed(2)) : 0;
      return {
        name: row.name,
        gstRate: row.gstRate,
        baseAmount: bAmount,
        finishAmount: fAmount,
        cgst: c,
        sgst: s,
        igst: i
      };
    });

    const isVoucherEligible = selectedCustomer?.voucherType === 'Type 1';
    const isVoucherType1 = isVoucherEligible && applyVoucher;
    const voucherGstDiscount = isVoucherType1 ? calculatedSummary.gstAmount : 0;
    const finalGrandTotal = calculatedSummary.grandTotal - voucherGstDiscount;

    return {
      ...calculatedSummary,
      items,
      grandTotal: finalGrandTotal,
      voucherGstDiscount,
      voucherApplied: isVoucherType1,
      isVoucherEligible,
    };
  }, [rows, products, deliveryType, applyVoucher, shippingAddress, selectedCustomer]);

  const updateRow = (id: string, updates: Partial<AcdemaRow>) => {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...updates };
      if (updates.productId) {
        const product = products.find((item) => item.id === updates.productId);
        next.productName = product?.name || '';
      }
      if (next.eyeletType === 'NONE') {
        next.eyeletCount = 0;
      }
      return next;
    }));
  };

  const addRow = () => {
    setRows((current) => [...current, makeRow(products[0])]);
  };

  const removeRow = (id: string) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUpiUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/designs/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Failed to upload screenshot.');
      const data = await response.json();
      setUpiProofUrl(data.fileUrl || '');
      setUpiPreview(URL.createObjectURL(file));
      toast.success('UPI screenshot uploaded.');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Unable to upload screenshot.');
    } finally {
      setUpiUploading(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerForm.businessName.trim() || !newCustomerForm.email.trim()) {
      toast.error('Business Name and email are required.');
      return;
    }

    if (newCustomerForm.gstType !== 'Unregistered') {
      if (!newCustomerForm.gstNumber.trim()) {
        toast.error('GST Number is mandatory for Regular or Composition types.');
        return;
      }
      if (!newCustomerForm.gstVerified) {
        toast.error('Please verify the GST Number before creating the customer.');
        return;
      }
    }

    setCreatingCustomer(true);
    try {
      const result = await createCustomer({
        email: newCustomerForm.email.trim(),
        name: newCustomerForm.businessName.trim(),
        businessName: newCustomerForm.businessName.trim(),
        phone: newCustomerForm.phone.trim(),
        houseNumber: newCustomerForm.houseNumber.trim(),
        roadName: newCustomerForm.roadName.trim(),
        city: newCustomerForm.city.trim(),
        state: newCustomerForm.state.trim(),
        country: newCustomerForm.country.trim(),
        pincode: newCustomerForm.pincode.trim(),
        gstType: newCustomerForm.gstType,
        gstNumber: newCustomerForm.gstType !== 'Unregistered' ? newCustomerForm.gstNumber.trim() : '',
        gstVerified: newCustomerForm.gstType !== 'Unregistered' ? newCustomerForm.gstVerified : false,
        gstDetails: (newCustomerForm.gstType !== 'Unregistered' && newCustomerForm.gstVerified) ? newCustomerForm.gstDetails : null,
        customerType: newCustomerForm.customerType,
        creditLimit: newCustomerForm.customerType === 'CREDIT' ? Number(newCustomerForm.creditLimit) || 0 : 0,
        voucherType: newCustomerForm.voucherType,
        initialBalance: 0,
        tempPassword: newCustomerForm.tempPassword.trim(),
      });

      if (!result.success || !result.uid) {
        throw new Error(result.error || 'Failed to create customer.');
      }

      const created = {
        uid: result.uid,
        email: newCustomerForm.email.trim(),
        displayName: newCustomerForm.businessName.trim(),
        name: newCustomerForm.businessName.trim(),
        businessName: newCustomerForm.businessName.trim(),
        phone: newCustomerForm.phone.trim(),
        customerType: newCustomerForm.customerType,
        creditLimit: newCustomerForm.customerType === 'CREDIT' ? Number(newCustomerForm.creditLimit) || 0 : 0,
        voucherType: newCustomerForm.voucherType,
        role: 'CUSTOMER' as const,
        usedCredit: 0,
      };

      setCustomers((prev) => [created as UserProfile, ...prev]);
      setSelectedCustomerId(result.uid);
      setCreatedCustomer({
        email: created.email,
        password: result.password || newCustomerForm.tempPassword,
        name: created.displayName,
      });
      setShowCreateCustomer(false);
      toast.success('Customer created successfully.');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Unable to create customer.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const submitQuotation = async () => {
    if (!selectedCustomerId) {
      toast.error('Please choose a customer.');
      return;
    }

    if (rows.length === 0) {
      toast.error('Add at least one product row.');
      return;
    }

    setLoading(true);
    try {
      await refreshAuthTokenCookie();

      const items = rows.map((row) => {
        const product = products.find((item) => item.id === row.productId);
        const width = Number(row.width) || 0;
        const height = Number(row.height) || 0;
        const quantity = Number(row.quantity) || 0;
        const rate = product?.baseRate || 0;
        const rowSubtotal = calculateRowSubtotal(row, product);

        return {
          productId: row.productId,
          productName: product?.name || row.productName || 'Custom Product',
          projectName: row.projectName || '',
          hsnCode: row.hsnCode || '',
          pcsNo: row.pcsNo || '',
          width: row.width,
          widthUnit: row.widthUnit,
          height: row.height,
          heightUnit: row.heightUnit,
          quantity,
          rate,
          eyeletType: row.eyeletType,
          eyeletCount: row.eyeletCount,
          subtotal: rowSubtotal,
          tiffPath: row.tiffPath,
        };
      });

      const customerSnapshot = selectedCustomer
        ? {
            uid: selectedCustomer.uid,
            name: selectedCustomer.name || selectedCustomer.displayName || 'Customer',
            displayName: selectedCustomer.displayName || selectedCustomer.name || 'Customer',
            email: selectedCustomer.email,
            phone: selectedCustomer.phone,
            address: selectedCustomer.address,
            businessName: selectedCustomer.businessName,
            customerType: selectedCustomer.customerType,
            voucherType: selectedCustomer.voucherType,
          }
        : undefined;

      const quotationPayload = {
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.displayName || selectedCustomer?.name || 'Customer',
        customerSnapshot,
        items,
        deliveryType,
        shippingAddress: deliveryType === 'selfPickup' ? 'Self Pickup' : shippingAddress,
        notes,
        totalSqFt: summary.totalSqFt,
        subtotal: summary.subtotal,
        deliveryCharge: summary.deliveryCharge,
        taxableAmount: summary.taxableAmount,
        gstAmount: summary.gstAmount,
        cgst: summary.cgst,
        sgst: summary.sgst,
        igst: summary.igst,
        grandTotal: summary.grandTotal,
        isInterstate: summary.isInterstate,
        voucherApplied: summary.voucherApplied,
        voucherGstDiscount: summary.voucherGstDiscount,
      };

      const result = await createStandaloneQuotation(quotationPayload as any);

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate quotation.');
      }

      toast.success(`Quotation generated: ${result.quotationNumber || ''}`);
      router.push('/quotations');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to submit quotation.');
    } finally {
      setLoading(false);
    }
  };

  const viewModel = {
    mode: 'quotation' as const,
    bootstrapLoading,
    profile,
    roles,
    customerSearch,
    setCustomerSearch,
    selectedCustomerId,
    setSelectedCustomerId,
    filteredCustomers,
    selectedCustomer,
    rows,
    addRow,
    updateRow,
    removeRow,
    products,
    calculateRowSubtotal: (row: any) => calculateRowSubtotal(row, products.find((p) => p.id === row.productId)),
    paymentMode,
    setPaymentMode,
    deliveryType,
    setDeliveryType,
    shippingAddress,
    setShippingAddress,
    upiUploading,
    upiPreview,
    upiProofUrl,
    handleUpload,
    showCreateCustomer,
    setShowCreateCustomer,
    creatingCustomer,
    createdCustomer,
    newCustomerForm,
    setNewCustomerForm,
    handleCreateCustomer,
    notes,
    setNotes,
    tiffError,
    setTiffError,
    summary,
    submitProxyOrder: submitQuotation,
    loading,
    applyVoucher,
    setApplyVoucher,
    verifyingGst,
    handleVerifyGst,
  };

  return <QuotationBuilderView vm={viewModel} />;
}
