'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Upload, 
  ChevronRight, 
  Maximize2, 
  Layers, 
  IndianRupee, 
  Box, 
  Loader2,
  FileCheck,
  Store,
  Truck,
  Zap,
  Train,
  User,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  UserCheck,
  MapPin,
  Palette,
  Search,
  ChevronDown,
  Star
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { createOrder, createCustomerGroupedOrders } from '@/lib/workflow';
import { refreshAuthTokenCookie } from '@/lib/refresh-auth-token';
import { calculateOrderSummary, calculateSqft, calculateRowSubtotal } from '@/lib/pricing-engine';
import { Product } from '@/types/models';
import { OrderWorkflowSnapshot } from '@/types/workflow';
import { getProducts } from '@/lib/actions/products';
import { getCustomers } from '@/lib/actions/users';
import { toast } from 'react-hot-toast';
import { UserProfile } from '@/types/auth';

// --- TYPES ---
interface OrderRow {
  id: string; // Internal ephemeral row ID
  projectName: string;
  productId: string; // The ID from Product model (e.g. 6000)
  productName: string;
  width: number | undefined;
  widthUnit: 'FT' | 'IN';
  height: number | undefined;
  heightUnit: 'FT' | 'IN';
  quantity: number;
  rate: number;
  eyeletType: 'METAL' | 'PLASTIC' | 'NONE';
  eyeletCount: number;
  driveLink: string; // Google Drive share link for artwork
  designType: 'CUSTOMER_DESIGN' | 'COMPANY_DESIGN';
  uploading?: boolean;
  uploadStats?: {
    originalSize: string;
    compressedSize: string;
    ratio: string;
    filename: string;
  };
  // Dynamic pricing snapshot from product
  eyeletPricing: {
    metal: number;
    plastic: number;
    none: 0;
  };
  deliveryPricing: {
    selfPickup: 0;
    door: number;
    courier: number;
    transport: number;
  };
}

export function OrderBuilder({ lockedProduct }: { lockedProduct?: any }) {
  const { profile, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedId = searchParams.get('productId');
  const preSelectedIds = (searchParams.get('productIds') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(true);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [deliveryType, setDeliveryType] = useState<'selfPickup' | 'door' | 'courier' | 'transport'>('door');
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CREDIT'>('CASH');
  const [notes, setNotes] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const shippingAddressRef = useRef<HTMLTextAreaElement | null>(null);
  
  // Proxy Ordering State
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const isStaff = profile?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT', 'DESIGNER'].includes(profile.role);
  const hasInitializedRef = useRef(false);

  // Fetch Data
  useEffect(() => {
    const fetch = async () => {
      try {
        const [prodData, custData] = await Promise.all([
          getProducts(),
          isStaff ? getCustomers() : Promise.resolve([])
        ]);

        const active = prodData.filter((p: Product) => p.status === 'ACTIVE');
        setAvailableProducts(active);
        if (isStaff) setCustomers(custData);
        
        // Initialize rows once from the most specific product selection available.
        if (active.length > 0 && !hasInitializedRef.current) {
          const multiSelected = preSelectedIds
            .map((id) => active.find((product: Product) => product.id === id))
            .filter(Boolean) as Product[];

          if (multiSelected.length > 0) {
            initializeOrder(multiSelected);
          } else {
            const product = lockedProduct || active.find((p: Product) => p.id === preSelectedId) || active[0];
            initializeOrder([product]);
          }
          hasInitializedRef.current = true;
        }

        // Pre-fill profile address for standard customers
        if (!isStaff && profile?.address) {
          setShippingAddress(profile.address);
        }
      } catch (error) {
        toast.error("Failed to load environment data");
      } finally {
        setFetchingProducts(false);
      }
    };
    fetch();
  }, [lockedProduct, preSelectedId, preSelectedIds.join(','), isStaff, profile?.address]);

  // Pre-fill address when staff selects a customer
  useEffect(() => {
    if (isStaff && selectedCustomerId) {
      const cust = customers.find(c => c.uid === selectedCustomerId);
      if (cust && cust.address) {
        setShippingAddress(cust.address);
      }
    }
  }, [isStaff, selectedCustomerId, customers]);

  const createRowFromProduct = (product: Product): OrderRow => ({
    id: Math.random().toString(36).substr(2, 9),
    projectName: '',
    productId: product.id,
    productName: product.name,
    width: undefined,
    widthUnit: 'FT',
    height: undefined,
    heightUnit: 'FT',
    quantity: 1,
    rate: product.baseRate,
    eyeletType: 'NONE',
    eyeletCount: 0,
    driveLink: '',
    designType: 'CUSTOMER_DESIGN',
    eyeletPricing: product.eyeletPricing,
    deliveryPricing: product.deliveryPricing
  });

  const initializeOrder = (products: Product[]) => {
    setRows(products.map((product) => createRowFromProduct(product)));
  };

  const addRow = () => {
    if (availableProducts.length === 0) return;
    const product = availableProducts[0];
    setRows([...rows, createRowFromProduct(product)]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const updateRow = (id: string, updates: Partial<OrderRow>) => {
    setRows(prevRows => prevRows.map(r => {
      if (r.id === id) {
        const updated = { ...r, ...updates };
        // If productId changed, update rates
        if (updates.productId) {
          const product = availableProducts.find(p => p.id === updates.productId);
          if (product) {
            updated.productName = product.name;
            updated.rate = product.baseRate;
            updated.eyeletPricing = product.eyeletPricing;
            updated.deliveryPricing = product.deliveryPricing;
          }
        }
        // Force eyelet count 0 if NONE
        if (updated.eyeletType === 'NONE') {
          updated.eyeletCount = 0;
        }
        return updated;
      }
      return r;
    }));
  };
  
  const handleFileUpload = async (rowId: string, file: File) => {
    if (!file) return;
    
    updateRow(rowId, { uploading: true });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }
      
      const data = await res.json();
      if (data.success) {
        const formatBytes = (bytes: number) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const dm = 2;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        };
        
        updateRow(rowId, {
          driveLink: data.fileUrl,
          uploadStats: {
            originalSize: formatBytes(data.originalSize),
            compressedSize: formatBytes(data.compressedSize),
            ratio: data.compressionRatio,
            filename: data.filename
          }
        });
        toast.success(`Uploaded and optimized successfully! Saved ${Math.max(0, (100 - parseFloat(data.compressionRatio))).toFixed(1)}% space.`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error uploading file');
      updateRow(rowId, { driveLink: '' });
    } finally {
      updateRow(rowId, { uploading: false });
    }
  };

  const summary = useMemo(() => {
    const pricingRows = rows.map(r => {
      // If the row has a specific productId, find it in availableProducts. If not found (or no ID), fall back to lockedProduct if it exists.
      const product = availableProducts.find(p => p.id === r.productId) || lockedProduct;
      const w = r.widthUnit === 'IN' ? (r.width || 0) / 12 : (r.width || 0);
      const h = r.heightUnit === 'IN' ? (r.height || 0) / 12 : (r.height || 0);
      return {
        name: product?.name || 'Custom Item',
        gstRate: product?.gst_rate ? product.gst_rate / 100 : 0.18,
        width: w,
        height: h,
        quantity: r.quantity,
        rate: r.rate,
        eyeletCount: r.eyeletType === 'NONE' ? 0 : r.quantity,
        eyeletRate: r.eyeletType === 'METAL' ? (product?.eyeletPricing?.metal ?? 0) : 
                    r.eyeletType === 'PLASTIC' ? (product?.eyeletPricing?.plastic ?? 0) : 0
      };
    });
    
    // Use delivery pricing from first product (usually consistent across order or uses first as anchor)
    // Or take max? Excel says it depends on product. Let's take the first one's delivery config for the selected type
    const dCharge = rows[0]?.deliveryPricing?.[deliveryType] || 0;

    const isInterstate = (() => {
      if (deliveryType === 'selfPickup') return false;
      if (!shippingAddress) return false;
      const addr = shippingAddress.toLowerCase();
      if (addr.includes('karnataka')) return false;
      if (/\bka\b/.test(addr)) return false;
      return true;
    })();
    const firstProduct = lockedProduct || availableProducts.find(p => p.id === rows[0]?.productId);
    const fallbackGstRate = firstProduct?.gst_rate ? firstProduct.gst_rate / 100 : 0.18;

    return calculateOrderSummary(pricingRows, dCharge, fallbackGstRate, isInterstate);
  }, [rows, deliveryType, shippingAddress, lockedProduct, availableProducts]);

  const validateOrder = () => {
    const errors: Record<string, string> = {};
    if (rows.length === 0) errors.general = "Order must have at least one item.";

    rows.forEach((row, idx) => {
      if (!row.width || row.width <= 0) errors[`row-${idx}-width`] = "Required";
      if (!row.height || row.height <= 0) errors[`row-${idx}-height`] = "Required";
      if (!row.quantity || row.quantity <= 0) errors[`row-${idx}-qty`] = "Min 1";
      if (!row.projectName) errors[`row-${idx}-project`] = "Required";
      // For CUSTOMER_DESIGN: either an uploaded file or a drive link is required
      if (row.designType === 'CUSTOMER_DESIGN' && !row.driveLink.trim()) {
        errors[`row-${idx}-file`] = isStaff 
          ? "Please paste a Drive link" 
          : "Please upload your design file or paste a Drive link";
      }
    });

    if (!deliveryType) errors.delivery = "Select delivery option";
    if (deliveryType !== 'selfPickup' && !shippingAddress.trim()) {
      errors.shippingAddress = "Please fill address";
    }
    if (!acceptTerms) errors.terms = "Accept terms to continue";

    setValidationErrors(errors);

    if (errors.shippingAddress) {
      requestAnimationFrame(() => {
        shippingAddressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        shippingAddressRef.current?.focus();
      });
    }

    return Object.keys(errors).length === 0;
  };

  const handleSubmitOrder = async () => {
    if (!user || !profile) return toast.error('User session not found.');
    if (!validateOrder()) return;

    setLoading(true);
    try {
      await refreshAuthTokenCookie().catch(e => console.warn('Token refresh failed', e));
    const targetCustomer = isStaff 
        ? customers.find(c => c.uid === selectedCustomerId) 
        : profile;

      if (!targetCustomer) {
        setLoading(false);
        return toast.error(isStaff ? 'Please select a customer first.' : 'User session not found.');
      }

      if (paymentMethod === 'CREDIT' && targetCustomer.creditStatus === 'PENDING_APPROVAL') {
        setLoading(false);
        return toast.error('This customer is pending credit approval. They cannot place credit orders yet.');
      }

      const tempOrderId = `TMP-${Date.now()}`;
      
      const itemsWithUrls = await Promise.all(rows.map(async (row) => {
        // If COMPANY_DESIGN is true, use 'DESIGN_BY_US' as placeholder URL
        const fileUrl = row.designType === 'COMPANY_DESIGN' ? 'DESIGN_BY_US' : row.driveLink.trim();
        
        const w = row.widthUnit === 'IN' ? (row.width || 0) / 12 : (row.width || 0);
        const h = row.heightUnit === 'IN' ? (row.height || 0) / 12 : (row.height || 0);
        const product = availableProducts.find(p => p.id === row.productId) || lockedProduct;
        const eyeletCount = row.eyeletType === 'NONE' ? 0 : row.quantity;
        const eyeletRate = row.eyeletType === 'METAL' ? (product?.eyeletPricing?.metal ?? 0) : 
                           row.eyeletType === 'PLASTIC' ? (product?.eyeletPricing?.plastic ?? 0) : 0;
        
        return {
          id: row.id,
          productName: row.productName,
          productId: row.productId,
          projectName: row.projectName,
          specs: {
            width: w,
            height: h,
            quantity: row.quantity,
            sqft: calculateSqft(w, h, row.quantity),
            widthUnit: row.widthUnit,
            heightUnit: row.heightUnit
          },
          materialMetadata: {
            materialType: row.productId, // Use ID as type
            eyeletType: row.eyeletType,
            eyeletCount: eyeletCount,
          },
          pricingSnapshot: {
            productId: row.productId,
            productName: row.productName,
            baseRate: row.rate,
            eyeletPricing: row.eyeletPricing,
            deliveryPricing: row.deliveryPricing,
            selectedEyeletType: row.eyeletType,
            eyeletRate: eyeletRate,
            subTotal: calculateRowSubtotal({ ...row, width: w, height: h, quantity: row.quantity, eyeletCount, eyeletRate }),
            tax: (availableProducts.find(p => p.id === row.productId)?.gst_rate ?? 18) / 100 // Reference dynamic gst_rate
          },
          subTotal: calculateRowSubtotal({ ...row, width: w, height: h, quantity: row.quantity, eyeletCount, eyeletRate }),
          fileUrl,
          designType: row.designType
        };
      }));

      // Get workflow from the first product as the anchor for this order
      const firstProduct = availableProducts.find(p => p.id === rows[0].productId);
      const productWorkflowSteps = firstProduct?.workflowSteps || [];

      const workflowSnapshot: OrderWorkflowSnapshot | null = productWorkflowSteps.length > 0 ? {
        steps: productWorkflowSteps.map((s, idx) => ({
          ...s,
          status: idx === 0 ? 'PENDING' : 'LOCKED',
          completedAt: undefined,
          completedBy: undefined,
          notes: ''
        })),
        currentStepIndex: 0,
        version: 1
      } : null;

      const submissionGstRate = firstProduct?.gst_rate ? firstProduct.gst_rate / 100 : 0.18;

      const submissionIsInterstate = (() => {
        if (deliveryType === 'selfPickup') return false;
        if (!shippingAddress) return false;
        const addr = shippingAddress.toLowerCase();
        if (addr.includes('karnataka')) return false;
        if (/\bka\b/.test(addr)) return false;
        return true;
      })();

      const result = await createCustomerGroupedOrders(
        { id: targetCustomer.uid, name: targetCustomer.displayName || 'Guest', type: paymentMethod },
        {
          grandTotal: summary.grandTotal,
          items: itemsWithUrls,
          snapshot: {}, // Add dummy snapshot if required by old signature or keep it empty
          customerSnapshot: {
            uid: targetCustomer.uid,
            name: targetCustomer.businessName || targetCustomer.name || 'Unknown',
            displayName: targetCustomer.displayName || targetCustomer.name || 'Unknown',
            email: targetCustomer.email,
            phone: targetCustomer.phone || ''
          },
          deliveryPricingSnapshot: rows[0].deliveryPricing, // Capture snapshot of whole delivery config
          deliveryChoice: deliveryType === 'selfPickup' ? 'PICKUP' : 
                          deliveryType === 'door' ? 'DOOR_DELIVERY' : 
                          deliveryType === 'courier' ? 'COURIER' : 'TRANSPORT',
          shippingAddress: deliveryType === 'selfPickup' ? 'Self Pickup' : shippingAddress,
          proxyExecutor: isStaff ? { uid: profile.uid, role: profile.role } : undefined,
          productionNotes: notes,
          workflowSnapshot: workflowSnapshot || undefined,
          gstRate: submissionGstRate,
          transportCharges: summary.deliveryCharges,
          isInterstate: submissionIsInterstate
        }
      );

      if (result.success) {
        const isGroup = !!result.orderIds;
        toast.success(`Order ${result.orderId} placed for ${targetCustomer.displayName}!`);
        // If staff, go to dashboard or tracking, if customer go to payment
        if (isStaff || paymentMethod === 'CREDIT') {
          router.push(isGroup ? `/customer/orders` : `/customer/orders/${result.orderId}`);
        } else {
          router.push(`/customer/payment/${result.orderId}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order.');
    } finally {
      setLoading(false);
    }
  };

  const currentProduct = availableProducts.find(p => p.id === rows[0]?.productId);

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const productImages = useMemo(() => {
    return rows
      .flatMap(r => {
        const p = availableProducts.find(prod => prod.id === r.productId);
        if (!p) return [];
        if (p.media?.images?.length) return p.media.images;
        if ((p as any).image) return [(p as any).image];
        return [];
      })
      .filter(Boolean) as string[];
  }, [rows, availableProducts]);

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

  const currentImage = productImages.length > 0 ? productImages[currentImageIndex % productImages.length] : null;

  if (fetchingProducts) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Waking Pricing Engine...</p>
      </div>
    );
  }

  return (
    <>
      <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-2 lg:-m-6 lg:p-4 relative z-10 min-h-[calc(100vh-4rem)] rounded-xl lg:rounded-2xl">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 w-full">

        <div className="flex flex-col gap-4">
          {/* Dynamic Product Grid */}
          <div className={`grid gap-6 items-start ${rows.length > 1 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] xl:grid-cols-[0.55fr_1.45fr]'}`}>
            {rows.map((row) => {
              const product = availableProducts.find(p => p.id === row.productId);
              if (!product) return null;
              
              const allImages = product.media?.images || [];
              const firstImage = allImages[0] || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200';
              
              if (rows.length === 1) {
                return (
                  <React.Fragment key={row.id}>
                    {/* Visual Showcase */}
                    <div className="flex flex-col gap-4 xl:sticky xl:top-8">
                      <div className="w-full max-w-[420px] mx-auto aspect-video min-h-[220px] rounded-[1.5rem] overflow-hidden bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative group">
                        {product.media?.video?.url ? (
                          <video src={product.media.video.url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                        ) : (
                          <img src={firstImage} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt={product.name} />
                        )}
                        <div className="absolute top-8 left-8 bg-white/90 backdrop-blur-xl px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm border border-black/5 z-10">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Authentication Active</span>
                        </div>
                      </div>
                      
                      {allImages.length > 1 && (
                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar w-full max-w-[640px] mx-auto">
                          {allImages.map((img, i) => (
                            <div key={i} className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 transition-all duration-300 transform ${i === 0 ? 'border-secondary shadow-lg shadow-secondary/10 -translate-y-1' : 'border-surface-container-low'}`}>
                              <img src={img} className="w-full h-full object-cover" alt="thumb" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Configuration & Data */}
                    <div className="flex flex-col justify-between space-y-6 h-full">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-2 py-1 bg-secondary-container/30 text-secondary text-[8px] font-black uppercase tracking-widest rounded-full border border-secondary/10">
                            {product.category} Protocol
                          </span>
                          <div className="flex items-center gap-1">
                            <Star size={10} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-[10px] font-black text-primary">4.9 (Live)</span>
                          </div>
                        </div>
                        <h2 className="text-3xl font-black font-display text-primary tracking-tighter leading-none mb-3">
                          {product.name}
                        </h2>
                        <p className="text-xs text-on-surface-variant font-medium leading-relaxed opacity-70 italic underline decoration-secondary decoration-2 underline-offset-4">
                          {product.specs?.description || 'No description available.'}
                        </p>
                      </div>

                      <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20 flex flex-col md:flex-row items-center justify-between gap-3 relative overflow-hidden">
                        <div className="relative z-10">
                          <p className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em] mb-0.5">Industrial Rate</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black font-display text-white tracking-tighter italic">₹{product.baseRate}</span>
                            <span className="text-white/60 font-black text-[8px] uppercase tracking-widest">/ SQFT</span>
                          </div>
                        </div>
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 blur-[80px] rounded-full" />
                      </div>

                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[10px] font-bold text-slate-700 leading-tight">
                        <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" /><span>Quality Verified</span></li>
                        <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" /><span>Rapid Response</span></li>
                        <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" /><span>Safe Logistics</span></li>
                        <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" /><span>Production Velocity: Dispatch in 2-3 Days.</span></li>
                        <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-pink-500 shrink-0" /><span>Express 24HR Enabled</span></li>
                      </ul>
                    </div>
                  </React.Fragment>
                );
              } else {
                return (
                  <div key={row.id} className="flex flex-col gap-2 bg-white/30 backdrop-blur-xl p-2.5 rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="w-full h-20 sm:h-24 rounded-xl overflow-hidden relative group shrink-0">
                      <img src={firstImage} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={product.name} />
                      <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-xl px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm border border-black/5 z-10">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[6px] font-black text-primary uppercase tracking-widest leading-none">Authentication Active</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-2 px-1 pb-0.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-1.5 py-0.5 bg-secondary-container/30 text-secondary text-[6px] font-black uppercase tracking-widest rounded-full border border-secondary/10">
                            {product.category} Protocol
                          </span>
                          <div className="flex items-center gap-0.5">
                            <Star size={7} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-[7px] font-black text-primary">4.9 (Live)</span>
                          </div>
                        </div>
                        <h2 className="text-base font-black font-display text-primary tracking-tight leading-none mb-1">
                          {product.name}
                        </h2>
                        <p className="text-[9px] text-on-surface-variant font-medium leading-relaxed opacity-70 italic line-clamp-1">
                          {product.specs?.description || 'No description available.'}
                        </p>
                      </div>

                      <div className="bg-primary p-2 rounded-lg flex flex-row items-center justify-between relative overflow-hidden shadow-sm">
                        <div className="relative z-10">
                          <p className="text-white/40 text-[6px] font-black uppercase tracking-[0.2em] mb-0.5">Industrial Rate</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black font-display text-white tracking-tighter italic">₹{product.baseRate}</span>
                            <span className="text-white/60 font-black text-[6px] uppercase tracking-widest">/ SQFT</span>
                          </div>
                        </div>
                        <div className="absolute -bottom-8 -right-8 w-16 h-16 bg-white/10 blur-[30px] rounded-full" />
                      </div>

                      <ul className="grid grid-cols-2 gap-1.5 pt-0.5 text-[8px] font-bold text-slate-700 leading-tight">
                        <li className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-500 shrink-0" /><span>Quality Verified</span></li>
                        <li className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-blue-500 shrink-0" /><span>Rapid Response</span></li>
                        <li className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" /><span>Safe Logistics</span></li>
                        <li className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-violet-500 shrink-0" /><span>Dispatch 2-3 Days</span></li>
                        <li className="flex items-center gap-1 col-span-2"><span className="h-1 w-1 rounded-full bg-pink-500 shrink-0" /><span>Express 24HR Enabled</span></li>
                      </ul>
                    </div>
                  </div>
                );
              }
            })}
          </div>

          <div className="w-full">
            <div className="grid gap-6 md:grid-cols-2">
              {isStaff ? (
                  <div className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Proxy</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-1 rounded-md">Staff Mode</span>
                    </div>
                    <div className="relative mb-4">
                      <div className="flex h-12 w-full items-center rounded-xl bg-slate-50 px-4 transition-all border border-slate-200 focus-within:border-slate-400">
                        <Search size={16} className="text-slate-400 mr-2" />
                        <input
                          value={customerSearch}
                          placeholder="Search directory..."
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder-slate-400"
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <select 
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 appearance-none"
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                      >
                        <option value="">-- Choose Customer --</option>
                        {customers
                          .filter(c => 
                            c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || 
                            c.businessName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            c.phone?.includes(customerSearch)
                          )
                          .map(c => (
                            <option key={c.uid} value={c.uid}>
                                {c.businessName || c.name} ({c.customerType})
                            </option>
                          ))}
                      </select>
                    </div>
                    {selectedCustomerId && (
                      <div className="mt-auto rounded-xl bg-blue-50 p-3 text-xs font-medium text-blue-800 border border-blue-200">
                        Acting on behalf of: <strong>{customers.find(c => c.uid === selectedCustomerId)?.displayName || customers.find(c => c.uid === selectedCustomerId)?.name}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative z-40 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                     <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Account Details</h3>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-black text-lg">
                           {profile?.name?.charAt(0)}
                        </div>
                        <div>
                           <p className="text-lg font-bold text-slate-800">{profile?.name}</p>
                           <p className="text-xs text-slate-500">{profile?.email}</p>
                           <p className="text-[10px] font-black uppercase text-blue-500 mt-1">{profile?.customerType} Account</p>
                        </div>
                     </div>
                  </div>
                )}

                <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 h-full flex flex-col">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                  <div className="flex gap-2 mb-4">
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
                    <div className="mt-auto space-y-2">
                       <textarea 
                          ref={shippingAddressRef}
                          value={shippingAddress} 
                          onChange={(e) => setShippingAddress(e.target.value)}
                          className={`w-full bg-slate-50 border rounded-xl p-3 text-sm h-20 outline-none focus:border-slate-400 font-medium resize-none transition-all ${validationErrors.shippingAddress ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          placeholder="Street Address, Landmark, City, State, PIN CODE..."
                        />
                        {!isStaff && (profile?.billing_address_line1 || profile?.shipping_address_line1 || (profile?.addresses && profile.addresses.length > 0)) && (
                          <div className="relative mt-2">
                            <select
                              onChange={(e) => {
                                if (e.target.value) setShippingAddress(e.target.value);
                              }}
                              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none focus:border-slate-400 appearance-none"
                              defaultValue=""
                            >
                              <option value="" disabled>-- Quick Select Saved Address --</option>
                              {profile?.billing_address_line1 && (
                                <option value={[profile.billing_address_line1, profile.billing_address_line2, profile.billing_area, profile.billing_city, profile.billing_state, profile.billing_pincode].filter(Boolean).join(', ')}>
                                  Primary: {[profile.billing_address_line1, profile.billing_city, profile.billing_state, profile.billing_pincode].filter(Boolean).join(', ')}
                                </option>
                              )}
                              {profile?.shipping_address_line1 && (
                                <option value={[profile.shipping_address_line1, profile.shipping_address_line2, profile.shipping_area, profile.shipping_city, profile.shipping_state, profile.shipping_pincode].filter(Boolean).join(', ')}>
                                  Secondary: {[profile.shipping_address_line1, profile.shipping_city, profile.shipping_state, profile.shipping_pincode].filter(Boolean).join(', ')}
                                </option>
                              )}
                              {profile?.addresses?.map((addr: any) => {
                                const fullAddr = [addr.houseNumber, addr.roadName, addr.area, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
                                return (
                                  <option key={addr.id} value={fullAddr}>
                                    Other: {[addr.houseNumber, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                                  </option>
                                );
                              })}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-3 pointer-events-none text-slate-400" />
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full mt-6 mb-6">
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
                      <th className="py-3 px-2">File Upload *</th>
                      <th className="py-3 px-2 text-right">Amount</th>
                      <th className="py-3 px-2 text-center">×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, index) => {
                      const product = availableProducts.find(item => item.id === row.productId);
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
                              const selProd = availableProducts.find(p => p.id === row.productId);
                              const isOpen = openRowId === row.id;
                              const qTerm = searchQuery.trim().toLowerCase();
                              const matched = qTerm ? availableProducts.filter(p => p.name.toLowerCase().includes(qTerm) || p.id.toString().toLowerCase().includes(qTerm)) : availableProducts;

                              return (
                                <div id={`error-row-${row.id}-product`} className="relative w-full min-w-[140px]">
                                  <div className={`flex h-10 w-full items-center rounded-lg bg-slate-50 px-3 border ${validationErrors[`row-${row.id}-product`] ? 'border-red-400' : 'border-slate-200'}`}>
                                    <input
                                      value={isOpen ? searchQuery : (selProd?.name ?? '')}
                                      placeholder="Select item..."
                                      onChange={(e) => { setOpenRowId(row.id); setSearchQuery(e.target.value); }}
                                      onFocus={() => { setOpenRowId(row.id); setSearchQuery(''); }}
                                      onBlur={() => setTimeout(() => { setOpenRowId(null); setSearchQuery(''); }, 160)}
                                      className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                    />
                                    <ChevronDown size={14} className="text-slate-400" />
                                  </div>
                                  {isOpen && (
                                    <div className="absolute left-0 top-full mt-1 w-[260px] z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                      {matched.slice(0, 50).map(p => (
                                        <div 
                                          key={p.id} 
                                          onMouseDown={(e) => { e.preventDefault(); updateRow(row.id, { productId: p.id }); setOpenRowId(null); setSearchQuery(''); }} 
                                          className="cursor-pointer border-b border-slate-50 p-3 hover:bg-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center transition-colors"
                                        >
                                          <span className="truncate pr-2">{p.name}</span>
                                          <span className="text-[9px] font-black tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">{p.id}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <input value={row.projectName || ''} onChange={(e) => updateRow(row.id, { projectName: e.target.value })} className={`h-10 w-full min-w-[80px] rounded-lg border ${validationErrors[`row-${index}-project`] ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800'} px-3 text-xs font-bold outline-none placeholder:text-slate-300`} placeholder="Project" />
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{gstRate}%</td>
                          <td className="py-3 px-2 tabular-nums">
                            <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                              <input id={`error-row-${row.id}-width`} type="number" value={row.width ?? ''} onChange={(e) => updateRow(row.id, { width: parseFloat(e.target.value) || undefined })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-width`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="W" />
                              <select value={row.widthUnit} onChange={(e) => updateRow(row.id, { widthUnit: e.target.value as any })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0 appearance-none"><option value="FT">ft</option><option value="IN">in</option></select>
                            </div>
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                              <input id={`error-row-${row.id}-height`} type="number" value={row.height ?? ''} onChange={(e) => updateRow(row.id, { height: parseFloat(e.target.value) || undefined })} className={`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 ${validationErrors[`row-${row.id}-height`] ? 'text-red-600 placeholder-red-300' : ''}`} placeholder="H" />
                              <select value={row.heightUnit} onChange={(e) => updateRow(row.id, { heightUnit: e.target.value as any })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0 appearance-none"><option value="FT">ft</option><option value="IN">in</option></select>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                            {sqft > 0 ? sqft.toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <input id={`error-row-${row.id}-quantity`} type="number" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: parseInt(e.target.value) || 1 })} className={`h-10 w-16 rounded-lg border bg-slate-50 text-center text-xs font-bold text-slate-800 outline-none ${validationErrors[`row-${row.id}-quantity`] ? 'border-red-400' : 'border-slate-200'}`} placeholder="Qty" />
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
                          <td className="py-3 px-2 tabular-nums w-[200px]">
                            <div className="flex flex-col gap-1 w-[200px]">
                              <select 
                                value={row.designType} 
                                onChange={(e) => updateRow(row.id, { designType: e.target.value as any, driveLink: e.target.value === 'COMPANY_DESIGN' ? '' : row.driveLink })} 
                                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold text-slate-700 outline-none"
                              >
                                <option value="CUSTOMER_DESIGN">I have my design</option>
                                <option value="COMPANY_DESIGN">Design it for me</option>
                              </select>

                              {row.designType === 'COMPANY_DESIGN' ? (
                                <div className="h-10 w-full rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[9px] font-black text-blue-600 uppercase tracking-widest px-2 text-center leading-tight">
                                  ✨ Designer Will Create
                                </div>
                              ) : row.uploading ? (
                                <div className="h-10 w-full rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-600">
                                  <Loader2 size={14} className="animate-spin mr-1" /> Uploading...
                                </div>
                              ) : row.driveLink && (row.driveLink.startsWith('/api/designs/') || row.driveLink.startsWith('http')) ? (
                                // ── Uploaded / linked file ──
                                <div className="flex flex-col gap-1">
                                  <div className="h-10 w-full rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-between px-2 relative group">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <FileCheck size={12} className="text-emerald-600 shrink-0" />
                                      <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest truncate">{row.uploadStats?.filename || 'Design Ready'}</span>
                                    </div>
                                    <button onClick={() => updateRow(row.id, { driveLink: '', uploadStats: undefined })} className="ml-1 p-0.5 bg-white rounded shadow-sm text-red-400 hover:bg-red-50 shrink-0" title="Remove">×</button>
                                  </div>
                                  {row.uploadStats?.compressedSize && (
                                    <span className="text-[8px] text-slate-400 font-medium px-1">{row.uploadStats.compressedSize} saved</span>
                                  )}
                                </div>
                              ) : (
                                // ── Upload zone (primary) ──
                                <div className="flex flex-col gap-1">
                                  {!isStaff && (
                                    <label className={`relative flex items-center justify-center w-full h-11 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                                      validationErrors[`row-${index}-file`]
                                        ? 'border-red-400 bg-red-50 text-red-600'
                                        : 'border-purple-300 bg-purple-50/60 hover:bg-purple-100 hover:border-purple-400 text-purple-700'
                                    }`}>
                                      <Upload size={13} className="mr-1.5" />
                                      <span className="text-[10px] font-black uppercase tracking-wider">Upload Design</span>
                                      <input type="file" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(row.id, file); }} className="hidden" />
                                    </label>
                                  )}
                                  <input
                                    type="url"
                                    value={row.driveLink}
                                    onChange={(e) => updateRow(row.id, { driveLink: e.target.value })}
                                    placeholder={isStaff ? "Paste Google Drive link" : "or paste Drive link"}
                                    className="h-7 w-full rounded border border-slate-200 bg-slate-50 px-2 text-[9px] font-medium text-slate-600 outline-none placeholder:text-slate-300 focus:border-slate-400"
                                  />
                                  {validationErrors[`row-${index}-file`] && (
                                    <span className="text-[8px] text-red-500 font-bold px-1">{validationErrors[`row-${index}-file`]}</span>
                                  )}
                                </div>
                              )}
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

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 lg:col-start-8">
              <div className="rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Payment Terminal</h3>
                
                <div className="flex gap-2 mb-6">
                  {['CASH', ...(((isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile)?.customerType === 'CASH') ? [] : ['CREDIT'])].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setPaymentMethod(opt as any)}
                      className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
                        paymentMethod === opt 
                          ? 'bg-slate-900 text-white shadow-md' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {opt === 'CASH' ? 'CASH / UPI' : 'CREDIT ACCOUNT'}
                    </button>
                  ))}
                </div>

                <div className="mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Special Notes</label>
                  <textarea 
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs h-16 outline-none focus:border-slate-400 font-bold resize-none"
                    placeholder="Specific color needs, hardware requirements..."
                  />
                </div>

                <div className="space-y-3 mb-6">
                  {summary.items?.map((item, idx) => (
                    <div key={idx} className="pb-2 border-b border-slate-100">
                      <div className="flex justify-between text-sm font-semibold text-slate-700">
                        <span className="truncate pr-4">{item.name}</span>
                        <span>Rs. {item.baseAmount.toLocaleString()}</span>
                      </div>
                      {summary.igst > 0 ? (
                        <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                          <span>IGST ({item.gstRate * 100}%)</span>
                          <span>Rs. {item.igst.toLocaleString()}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                            <span>CGST ({(item.gstRate * 100) / 2}%)</span>
                            <span>Rs. {item.cgst.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                            <span>SGST ({(item.gstRate * 100) / 2}%)</span>
                            <span>Rs. {item.sgst.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      {item.finishAmount > 0 && (
                        <div className="flex justify-between text-[11px] font-medium text-emerald-600 mt-0.5">
                          <span>Finish</span>
                          <span>Rs. {item.finishAmount.toLocaleString()}</span>
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
                        <span>Rs. {summary.deliveryCharges.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 pt-2 border-t border-slate-200">
                    <div className="flex justify-between text-2xl font-black text-slate-900">
                      <span>Grand Total</span>
                      <span>Rs. {summary.grandTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {paymentMethod === 'CREDIT' && (
                  <div className="mb-4">
                    {(() => {
                      const target = isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile;
                      if (!target) return null;
                      const available = target.creditLimit - target.usedCredit;
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

                <div className="mb-4">
                  <label className="flex items-start gap-3 cursor-pointer group hover:bg-white/50 p-2 rounded-xl transition-all">
                    <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 rounded-[4px] border-slate-300 text-emerald-500 w-4 h-4 shadow-sm" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-snug group-hover:text-slate-800 transition-all">Confirm dimensions match industrial specs & artwork is final.</span>
                  </label>
                  {validationErrors.terms && <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest mt-1 ml-7">Acceptance Required</p>}
                </div>

                {!acceptTerms && (
                  <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest text-center mb-3">
                    ⚠ Tick confirmation checkbox to enable
                  </p>
                )}
                {acceptTerms && summary.grandTotal === 0 && (
                  <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest text-center mb-3">
                    ⚠ Enter Width, Height & Quantity
                  </p>
                )}

                <button
                  onClick={() => {
                    if (paymentMethod === 'CREDIT') {
                      setShowCreditModal(true);
                    } else {
                      handleSubmitOrder();
                    }
                  }}
                  disabled={loading || summary.grandTotal === 0 || !acceptTerms || (paymentMethod === 'CREDIT' && summary.grandTotal > ((isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile)?.creditLimit || 0) - ((isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile)?.usedCredit || 0))}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/30 hover:bg-[#00a892] disabled:opacity-50 disabled:grayscale transition-all"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                  Send Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100">
            <h3 className="text-lg font-black tracking-tight text-slate-900 mb-2">Confirm Credit Usage</h3>
            <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
              A credit amount of <strong className="text-slate-900">₹{summary.grandTotal.toLocaleString()}</strong> will be deducted from your account balance. Do you want to proceed?
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
                  handleSubmitOrder();
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
    </>
  );
}
