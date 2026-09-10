'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { Product } from '@/types/models';
import { UserProfile } from '@/types/auth';
import { getCustomers } from '@/lib/actions/users';
import { createCustomer } from '@/lib/actions/users';
import { getProducts } from '@/lib/actions/products';
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
  description?: string; // Additional description for stock item (like Tally)
  hsnCode: string;
  billingMode?: 'A' | 'B';
  pcsNo: string;
  width: string;
  widthUnit: 'FT' | 'IN';
  height: string;
  heightUnit: 'FT' | 'IN';
  quantity: string;
  eyeletType: 'METAL' | 'PLASTIC' | 'NONE';
  eyeletCount: number;
  tiffPath: string;
  manualRate?: string; // operator-overridden rate (like Tally — editable per row)
}

const makeRow = (product?: Product): AcdemaRow => {
  const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (product.unit_of_measure?.toLowerCase() === 'sqft' || product.tally_uom?.toLowerCase() === 'sqft')) : false;
  const defaultMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
  return {
    id: Math.random().toString(36).slice(2, 10),
    productId: product?.id || '',
    productName: product?.name || '',
    projectName: '',
    description: '',
    hsnCode: '',
    billingMode: defaultMode,
    pcsNo: '1',
    width: hasMultipleSizes ? String(product?.default_width || '1') : '',
    widthUnit: (product?.default_width_unit as any) || 'FT',
    height: hasMultipleSizes ? String(product?.default_length || '1') : '',
    heightUnit: (product?.default_length_unit as any) || 'FT',
    quantity: '1',
    eyeletType: 'NONE',
    eyeletCount: 0,
    tiffPath: '',
  };
};

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
        setRows([makeRow()]);
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

  const [customerSearching, setCustomerSearching] = useState(false);

  // Live server customer search from contacts table
  useEffect(() => {
    const term = customerSearch.trim();
    if (!term || term.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const res = await fetch(`/api/v1/contacts?type=customer&limit=50&search=${encodeURIComponent(term)}`);
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && !cancelled) {
          const serverCustomers = json.data.map((c: any) => ({
            id: c.id,
            uid: c.id,
            name: c.name || 'Unknown',
            displayName: c.name || 'Unknown',
            businessName: c.name || 'Unknown',
            email: c.email || '',
            phone: c.phone || '',
            role: 'CUSTOMER',
            customerType: (c.paymentTermsDays && c.paymentTermsDays > 0) ? 'CREDIT' : 'CASH',
            creditLimit: Number(c.creditLimit ?? 0),
            usedCredit: Number(c.usedCredit ?? (c.owesYou ? c.owesYou / 100 : 0)),
            gstNumber: c.taxNumber || '',
            billing_address_line1: c.billingAddressLine1 || c.billing_address_line1,
            billing_address_line2: c.billingAddressLine2 || c.billing_address_line2,
            billing_area: c.billingArea || c.billing_area,
            billing_city: c.billingCity || c.billing_city,
            billing_district: c.billingDistrict || c.billing_district,
            billing_state: c.billingState || c.billing_state,
            billing_pincode: c.billingPincode || c.billing_pincode,
            billing_country: c.billingCountry || c.billing_country,
            shipping_address_line1: c.shippingAddressLine1 || c.shipping_address_line1,
            shipping_address_line2: c.shippingAddressLine2 || c.shipping_address_line2,
            shipping_area: c.shippingArea || c.shipping_area,
            shipping_city: c.shippingCity || c.shipping_city,
            shipping_district: c.shippingDistrict || c.shipping_district,
            shipping_state: c.shippingState || c.shipping_state,
            shipping_pincode: c.shippingPincode || c.shipping_pincode,
            shipping_country: c.shippingCountry || c.shipping_country,
            place_of_supply: c.placeOfSupply || c.place_of_supply,
            ...c,
          }));

          setCustomers((prev) => {
            const map = new Map();
            prev.forEach((item) => map.set(item.uid || (item as any).id, item));
            serverCustomers.forEach((item: any) => map.set(item.uid || item.id, item));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('Server customer search failed:', err);
      } finally {
        if (!cancelled) setCustomerSearching(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerSearch]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => {
      return [customer.name, customer.displayName, customer.phone, customer.businessName, customer.email, (customer as any).gstNumber, (customer as any).taxNumber]
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
      if (parts.length > 0) {
        setShippingAddress(parts.join(', '));
      }
    } else if (selectedCustomer.address && selectedCustomer.address.trim()) {
      setShippingAddress(selectedCustomer.address.trim());
    } else {
      const cust = selectedCustomer as any;
      const parts = [
        cust.billing_city || cust.city || '',
        cust.billing_state || cust.state || cust.place_of_supply || '',
        cust.billing_pincode || cust.pincode || ''
      ].filter(Boolean);
      if (parts.length > 0) {
        setShippingAddress(parts.join(', '));
      }
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
      const rawUom = ((product as any)?.tally_uom || (product as any)?.unit_of_measure || (row as any).unit || '').trim().toLowerCase();
      const cleanUom = rawUom.replace(/[\s\._-]/g, '');
      const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf')) : false;
      const isSqft = hasMultipleSizes;
      const isDirect = !isSqft;
      const currentMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
      const isModeA = currentMode === 'A';
      const isModeB = currentMode === 'B';
      const width = Number(row.width !== undefined && row.width !== '' ? row.width : (hasMultipleSizes ? (product?.default_width || 1) : 1)) || 1;
      const height = Number(row.height !== undefined && row.height !== '' ? row.height : (hasMultipleSizes ? (product?.default_length || 1) : 1)) || 1;
      const widthInFt = row.widthUnit === 'IN' ? width / 12 : width;
      const heightInFt = row.heightUnit === 'IN' ? height / 12 : height;
      const sqft = hasMultipleSizes ? ((widthInFt > 0 && heightInFt > 0) ? (widthInFt * heightInFt) : 1) : 1;
      const pcs = Math.max(1, Number(row.pcsNo || '1'));
      const totalBilledSqft = sqft * pcs;
      const baseRate = (row.manualRate !== undefined && row.manualRate !== '') ? Number(row.manualRate) || 0 : (product?.baseRate || 0);
      const qtyNum = Number(row.quantity !== undefined && row.quantity !== '' ? row.quantity : (isDirect ? 1 : (isModeB ? totalBilledSqft : 1))) || 1;
      const eyeletRate = (row.eyeletType === 'METAL'
        ? product?.eyeletPricing?.metal || 0
        : row.eyeletType === 'PLASTIC'
          ? product?.eyeletPricing?.plastic || 0
          : 0);
          
      return {
        name: product?.name || 'Unknown Item',
        width: isDirect ? 1 : widthInFt,
        height: isDirect ? 1 : heightInFt,
        quantity: isDirect ? qtyNum : (isModeA ? qtyNum : pcs),
        rate: baseRate,
        isDirectSelling: isDirect,
        eyeletCount: row.eyeletType === 'NONE' ? 0 : (isModeA ? qtyNum : pcs),
        eyeletRate,
        gstRate: (product?.gst_rate || 18) / 100,
      };
    });

    const calculatedSummary = calculateOrderSummary(pricingRows, dCharge, 0.18, isInterstate);

    const items = pricingRows.map((row) => {
      const bAmount = row.isDirectSelling ? (row.quantity * row.rate) : (row.width * row.height * row.quantity * row.rate);
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
        const rawUom = ((product as any)?.tally_uom || (product as any)?.unit_of_measure || '').trim().toLowerCase();
        const cleanUom = rawUom.replace(/[\s\._-]/g, '');
        const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf')) : false;
        const defaultMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
        
        // Populate default dimensions and settings for the selected product
        next.billingMode = defaultMode;
        next.width = hasMultipleSizes ? String(product?.default_width || '1') : '';
        next.widthUnit = (product?.default_width_unit as any) || 'FT';
        next.height = hasMultipleSizes ? String(product?.default_length || '1') : '';
        next.heightUnit = (product?.default_length_unit as any) || 'FT';
        next.manualRate = undefined; // reset manual rate so product baseRate takes effect
      }
      if (next.eyeletType === 'NONE') {
        next.eyeletCount = 0;
      }
      return next;
    }));
  };

  const addRow = (prod?: Product) => {
    setRows((current) => [...current, makeRow(prod)]);
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

    const validRows = rows.filter((r) => r.productId);
    if (validRows.length === 0) {
      toast.error('Add at least one product row.');
      return;
    }

    setLoading(true);
    try {
      await refreshAuthTokenCookie();

      const items = validRows.map((row) => {
        const product = products.find((item) => item.id === row.productId);
        const rawUom = ((product as any)?.tally_uom || (product as any)?.unit_of_measure || (row as any).unit || '').trim().toLowerCase();
        const cleanUom = rawUom.replace(/[\s\._-]/g, '');
        const hasMultipleSizes = product ? (product.has_multiple_sizes ?? product.hasMultipleSizes ?? (cleanUom === 'sqft' || cleanUom === 'sqf')) : false;
        const isSqft = hasMultipleSizes;
        const isDirect = !isSqft;
        const currentMode = (product as any)?.tally_billing_mode || (product as any)?.tallyBillingMode || 'B';
        const isModeA = currentMode === 'A';
        const isModeB = currentMode === 'B';
        const width = Number(row.width !== undefined && row.width !== '' ? row.width : (hasMultipleSizes ? (product?.default_width || 1) : 0)) || 0;
        const height = Number(row.height !== undefined && row.height !== '' ? row.height : (hasMultipleSizes ? (product?.default_length || 1) : 0)) || 0;
        const widthInFt = row.widthUnit === 'IN' ? width / 12 : width;
        const heightInFt = row.heightUnit === 'IN' ? height / 12 : height;
        const sqft = hasMultipleSizes ? ((widthInFt > 0 && heightInFt > 0) ? (widthInFt * heightInFt) : 1) : 1;
        const pcs = Math.max(1, Number(row.pcsNo || '1'));
        const totalBilledSqft = sqft * pcs;
        const qtyNum = Number(row.quantity !== undefined && row.quantity !== '' ? row.quantity : (isDirect ? 1 : (isModeB ? totalBilledSqft : 1))) || 1;
        const effectiveRate = (row.manualRate !== undefined && row.manualRate !== '') 
          ? Number(row.manualRate) || 0 
          : (product?.baseRate || 0);
        const eyeletRate = (row.eyeletType === 'METAL'
          ? product?.eyeletPricing?.metal || 0
          : row.eyeletType === 'PLASTIC'
            ? product?.eyeletPricing?.plastic || 0
            : 0);

        const calculatedRatePerUnit = isDirect ? effectiveRate : (isModeA ? (sqft * effectiveRate) : effectiveRate);
        const rowSubtotal = isDirect
          ? Number((qtyNum * effectiveRate + (row.eyeletType !== 'NONE' ? eyeletRate : 0)).toFixed(2))
          : (isModeA
              ? Number((qtyNum * calculatedRatePerUnit + (row.eyeletType !== 'NONE' ? eyeletRate : 0)).toFixed(2))
              : Number((totalBilledSqft * effectiveRate + (row.eyeletType !== 'NONE' ? eyeletRate * pcs : 0)).toFixed(2)));

        return {
          productId: row.productId,
          productName: product?.name || row.productName || 'Custom Product',
          projectName: row.projectName || '',
          description: row.description || row.projectName || '',
          notes: row.description || '',
          hsnCode: row.hsnCode || '',
          billingMode: currentMode,
          pcsNo: isModeA ? '' : (row.pcsNo || '1'),
          width,
          widthUnit: row.widthUnit,
          height,
          heightUnit: row.heightUnit,
          quantity: isModeA ? qtyNum : (isSqft ? totalBilledSqft : (Number(row.quantity) || pcs)),
          unit: (product as any)?.unit_of_measure || (product as any)?.tally_uom || 'N',
          rate: effectiveRate,
          eyeletType: row.eyeletType,
          eyeletCount: row.eyeletType === 'NONE' ? 0 : (isModeA ? qtyNum : pcs),
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
        totalSqFt: summary.totalSqft,
        subtotal: summary.subTotalBeforeGst,
        deliveryCharge: summary.deliveryCharges,
        taxableAmount: summary.subTotalBeforeGst,
        gstAmount: summary.gstAmount,
        cgst: summary.cgst,
        sgst: summary.sgst,
        igst: summary.igst,
        grandTotal: summary.grandTotal,
        isInterstate: (selectedCustomer as any)?.state && (selectedCustomer as any)?.state !== 'Tamil Nadu',
        voucherApplied: summary.voucherApplied,
        voucherGstDiscount: summary.voucherGstDiscount,
      };

      const result = await createStandaloneQuotation(quotationPayload as any);

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate quotation.');
      }

      toast.success(`Quotation generated: ${(result as any).quotationNumber || ''}`);
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
    customerSearching,
    selectedCustomerId,
    setSelectedCustomerId,
    filteredCustomers,
    selectedCustomer,
    rows,
    addRow,
    updateRow,
    removeRow,
    products,
    calculateRowSubtotal,
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
