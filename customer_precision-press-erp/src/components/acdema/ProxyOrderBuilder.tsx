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
import { createAcdemaProxyOrder } from '@/lib/actions/acdema';
import { ProxyOrderBuilderView } from '@/components/acdema/ProxyOrderBuilderView';

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

export function ProxyOrderBuilder() {
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

      // Populate form with fetched data
      setNewCustomerForm((f) => {
        const nextForm = { ...f, businessName: data.data?.legalName || data.data?.tradeName || f.businessName };
        
        // Very basic parsing for address - could be improved if Sandbox structure is known exactly
        if (data.data?.address) {
          const parts = data.data.address.split(',').map((p: string) => p.trim());
          if (parts.length > 0) {
            nextForm.state = parts.find((p: string) => /karnataka|kerala|tamil/i.test(p)) || nextForm.state;
            nextForm.pincode = parts.find((p: string) => /^\d{6}$/.test(p)) || nextForm.pincode;
            // Best effort address breakdown
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
        toast.error('Unable to load proxy order data.');
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

  const selectedCustomer = customers.find((customer) => customer.uid === selectedCustomerId) || null;

  const [applyVoucher, setApplyVoucher] = useState(false);

  useEffect(() => {
    if (!selectedCustomer) return;

    if (deliveryType === 'selfPickup') {
      setShippingAddress('Self Pickup');
      return;
    }

    // Prioritize Address 2 (Shipping) if it exists
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
    } 
    // Fall back to Address 1 (Billing)
    else if ((selectedCustomer as any).billing_address_line1) {
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
    }
    // Fall back to addresses JSON array if it exists
    else if (selectedCustomer.addresses && selectedCustomer.addresses.length > 0) {
      const a = selectedCustomer.addresses[selectedCustomer.addresses.length - 1]; // pick latest
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
    }
    // Fall back to legacy address
    else if (selectedCustomer.address) {
      setShippingAddress(selectedCustomer.address);
    }
    
    // Reset voucher when customer changes
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
        name: newCustomerForm.businessName.trim(), // Name field uses businessName
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
        email: newCustomerForm.email.trim(),
        password: result.password || newCustomerForm.tempPassword.trim(),
        name: newCustomerForm.businessName.trim(),
      };

      setCreatedCustomer(created);
      setShowCreateCustomer(false);
      toast.success('Customer created and credentials ready to share.');
      setSelectedCustomerId(result.uid);
      const refreshedCustomers = await getCustomers();
      setCustomers(refreshedCustomers);
      setNewCustomerForm({
        businessName: '',
        email: '',
        phone: '',
        houseNumber: '',
        roadName: '',
        city: '',
        state: '',
        country: 'India',
        pincode: '',
        gstType: 'Unregistered',
        gstNumber: '',
        gstVerified: false,
        gstDetails: null,
        customerType: 'CASH',
        creditLimit: 0,
        voucherType: 'Type 0',
        tempPassword: `PP-${Math.floor(Math.random() * 90000) + 10000}`,
      });
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to create customer.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const [addingAddress, setAddingAddress] = useState(false);

  const handleAddDeliveryAddress = async (addressData: any) => {
    if (!selectedCustomer) return false;
    setAddingAddress(true);
    try {
      const { addCustomerAddress } = await import('@/lib/actions/users');
      const result = await addCustomerAddress(selectedCustomer.uid, addressData);
      if (result.success && result.address) {
        setCustomers((prev) => prev.map(c => {
          if (c.uid === selectedCustomer.uid) {
            return {
              ...c,
              addresses: [...(c.addresses || []), result.address],
              defaultAddressId: result.address.id
            };
          }
          return c;
        }));
        
        const a = result.address;
        const cName = selectedCustomer.displayName || selectedCustomer.name;
        const cPhone = selectedCustomer.phone || '';
        const parts = [
          a.houseNumber,
          a.roadName,
          (a as any).area,
          a.city,
          (a as any).district,
          a.state,
          a.pincode
        ].filter(Boolean);
        const fullStr = `${cName} ${cPhone ? `(${cPhone})` : ''}\n${parts.join(', ')}`;
        setShippingAddress(fullStr);
        toast.success('Address added successfully');
        return true;
      } else {
        toast.error(result.error || 'Failed to add address');
        return false;
      }
    } catch (e: any) {
      toast.error(e.message || 'Error adding address');
      return false;
    } finally {
      setAddingAddress(false);
    }
  };

  const submitProxyOrder = async () => {
    setTiffError('');

    if (!selectedCustomer) {
      toast.error('Select a customer first.');
      return;
    }

    if (!rows.length) {
      toast.error('Add at least one item.');
      return;
    }

    if (deliveryType !== 'selfPickup' && !shippingAddress.trim()) {
      toast.error('Enter the shipping / delivery address.');
      return;
    }

    const resolvedRowPaths = rows.map((row) => row.tiffPath.trim());
    const invalidRowIndex = -1; // Removed extension validation
    
    if (invalidRowIndex !== -1) {
      toast.error(`Invalid file type in row ${invalidRowIndex + 1}. All files must have a valid extension.`);
      return;
    }

    if (paymentMode === 'UPI' && !upiProofUrl) {
      toast.error('Upload the UPI screenshot first.');
      return;
    }

    setLoading(true);
    try {
      const firstProduct = products.find(p => p.id === rows[0]?.productId);
      const submissionGstRate = firstProduct?.gst_rate ? firstProduct.gst_rate / 100 : 0.18;

      const submissionIsInterstate = (() => {
        if (deliveryType === 'selfPickup') return false;
        if (!shippingAddress) return false;
        const addr = shippingAddress.trim().toLowerCase();
        if (addr.includes('karnataka')) return false;
        if (/\bka\b/.test(addr)) return false;
        return true;
      })();

      const result = await createAcdemaProxyOrder({
        customerId: selectedCustomer.uid,
        customerSnapshot: {
          uid: selectedCustomer.uid,
          name: selectedCustomer.name || selectedCustomer.displayName || 'Customer',
          displayName: selectedCustomer.displayName || selectedCustomer.name || 'Customer',
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          address: selectedCustomer.address,
        },
        deliveryChoice: deliveryType === 'selfPickup' ? 'PICKUP' : deliveryType === 'door' ? 'DOOR_DELIVERY' : deliveryType === 'courier' ? 'COURIER' : 'TRANSPORT',
        shippingAddress: deliveryType === 'selfPickup' ? 'Self Pickup' : shippingAddress.trim(),
        items: rows.map((row) => {
          const product = products.find((item) => item.id === row.productId);
          const width = Number(row.width) || 0;
          const height = Number(row.height) || 0;
          const quantity = Number(row.quantity) || 1;
          const widthInFt = row.widthUnit === 'IN' ? width / 12 : width;
          const heightInFt = row.heightUnit === 'IN' ? height / 12 : height;
          const eyeletRate = row.eyeletType === 'METAL'
            ? product?.eyeletPricing?.metal || 0
            : row.eyeletType === 'PLASTIC'
              ? product?.eyeletPricing?.plastic || 0
              : 0;

          const effectiveTiffPath = row.tiffPath.trim();
          return {
            id: row.id,
            productId: row.productId,
            productName: row.productName || product?.name || 'Item',
            projectName: row.projectName,
            width,
            widthUnit: row.widthUnit,
            height,
            heightUnit: row.heightUnit,
            quantity,
            eyeletType: row.eyeletType,
            eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
            rate: product?.baseRate || 0,
            eyeletRate,
            fileUrl: effectiveTiffPath,
            tiffPath: effectiveTiffPath,
            pricingSnapshot: {
              productId: row.productId,
              productName: row.productName || product?.name || 'Item',
              baseRate: product?.baseRate || 0,
              eyeletPricing: product?.eyeletPricing,
              deliveryPricing: product?.deliveryPricing,
              selectedEyeletType: row.eyeletType,
              eyeletRate,
              subTotal: calculateRowSubtotal({
                width: widthInFt,
                height: heightInFt,
                quantity,
                rate: product?.baseRate || 0,
                eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
                eyeletRate,
              }),
              tax: (product?.gst_rate ?? 18) / 100
            },
            subTotal: calculateRowSubtotal({
              width: widthInFt,
              height: heightInFt,
              quantity,
              rate: product?.baseRate || 0,
              eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
              eyeletRate,
            }),
          };
        }),
        grandTotal: summary.grandTotal,
        paymentMode,
        isInterstate: submissionIsInterstate,
        gstRate: submissionGstRate,
        transportCharges: summary.deliveryCharges,
        deliveryPricingSnapshot: firstProduct?.deliveryPricing,
        tiffPath: resolvedRowPaths[0] || '',
        upiProofUrl: paymentMode === 'UPI' ? upiProofUrl : '',
        notes,
        referenceNumber: `${selectedCustomer.uid}-${Date.now().toString().slice(-6)}`,
        depositDate: new Date().toISOString().split('T')[0],
        voucherApplied: summary.voucherApplied,
        voucherGstDiscount: summary.voucherGstDiscount,
      });

      if (!result.success || (!result.orderId && !result.orderIds?.length)) {
        throw new Error(result.error || 'Failed to create proxy order.');
      }

      toast.success(`Proxy orders created successfully.`);
      const highlightIds = result.orderIds?.length ? result.orderIds.join(',') : result.orderId;
      const basePath = profile?.role === 'ACDEMA' ? '/acdema' : profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' ? '/admin' : `/${profile?.role?.toLowerCase() || 'admin'}`;
      router.push(`${basePath}/orders?highlight=${highlightIds}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to create proxy order.');
    } finally {
      setLoading(false);
    }
  };

  const viewModel = {
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
    setTiffError,
    tiffError,
    notes,
    setNotes,
    summary,
    submitProxyOrder,
    loading,
    addingAddress,
    handleAddDeliveryAddress,
    applyVoucher,
    setApplyVoucher,
    verifyingGst,
    handleVerifyGst,
  };

  if (bootstrapLoading) {
    return React.createElement('div', { className: 'flex min-h-[50vh] items-center justify-center' }, 'Loading...');
  }

  return React.createElement(ProxyOrderBuilderView, { vm: viewModel });
}
