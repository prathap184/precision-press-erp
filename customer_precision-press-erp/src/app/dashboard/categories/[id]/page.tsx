'use client';


import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  ChevronLeft,
  Star,
  Check,
  Activity,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { toggleCart, getCartStatus } from '@/lib/actions/cart';
import { toggleCartClient } from '@/lib/client-cart';
import { toast } from 'react-hot-toast';
import { getProductsByCategory } from '@/lib/actions/products';
import { Product } from '@/types/models';

export default function ProductListPage() {
  const { id } = useParams();
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['category-products', id],
    queryFn: () => getProductsByCategory(id as string),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Header with Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-surface-container-lowest p-8 rounded-[2.5rem] border border-surface-container-low shadow-sm">
          <div className="flex items-center gap-6">
            <Link href="/dashboard/categories" className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black font-display text-primary tracking-tighter capitalize">{id} Printing</h1>
              <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest mt-1">{filtered.length} Materials Available</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="relative group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-on-surface-variant/20 group-focus-within:text-secondary transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search Material..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-16 pr-8 py-5 text-sm font-bold bg-surface-container-low border-none rounded-2xl focus:ring-4 focus:ring-secondary/5 focus:bg-white transition-all w-full lg:w-96 placeholder:uppercase"
              />
            </div>
            <button className="bg-surface-container-low text-primary px-8 py-5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-secondary hover:text-white transition-all flex items-center gap-3">
              <Filter size={16} />
              Refine
            </button>
          </div>
        </div>

        {/* Product Grid - Flipkart Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { profile } = useAuth();
  const [inCart, setInCart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);

  React.useEffect(() => {
    if (profile?.uid) {
      getCartStatus(profile.uid, product.id).then((v) => setInCart(!!v));
    }
  }, [profile?.uid, product.id]);

  // We could fetch initial state here, but for simplicity we'll just toggle and show feedback
  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profile?.uid) {
      toast.error('Please login to add to cart');
      return;
    }
    setBusy(true);
    const payload = {
      id: product.id,
      name: product.name,
      category: product.category,
      baseRate: product.baseRate,
      basePrice: product.baseRate,
      media: { images: product.media?.images?.slice(0,1) || [] }
    };
    // Optimistic UI: update immediately and perform server update in background
    let animTimer: any;
    setAnimating(true);
    animTimer = setTimeout(() => setAnimating(false), 1200);
    const optimistic = !inCart;
    setInCart(optimistic);
    toast.success(optimistic ? 'Added to cart' : 'Removed from cart');

    (async () => {
      try {
        const res: any = await toggleCart(profile.uid, payload);
        if (!res?.success) {
          const fallback = await toggleCartClient(profile.uid, payload);
          if (!fallback.success) {
            setInCart(!optimistic);
            toast.error(fallback.error || res.error || 'Failed to update cart');
          } else {
            setInCart(fallback.action === 'added');
          }
        } else {
          setInCart(res.action === 'added');
        }
      } catch (err: any) {
        const fallback = await toggleCartClient(profile.uid, payload);
        if (!fallback.success) {
          setInCart(!optimistic);
          toast.error(fallback.error || err?.message || 'Failed to update cart');
        } else {
          setInCart(fallback.action === 'added');
        }
      } finally {
        clearTimeout(animTimer);
        setAnimating(false);
        setBusy(false);
      }
    })();
  };

  return (
    <div className="group bg-surface-container-lowest rounded-xl overflow-hidden border border-surface-container-low hover:border-secondary transition-all flex flex-col h-full shadow-sm hover:shadow-lg relative">
      <Link href={`/dashboard/products/${product.id}`} className="relative h-44 overflow-hidden bg-surface-container-low/50 block">
        <img 
          src={product.media?.images?.[0] || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=400'} 
          alt={product.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
        <div className="absolute top-4 left-4 flex gap-2">
           <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
             <Star size={10} className="fill-yellow-400 text-yellow-400" />
             <span className="text-[9px] font-black text-primary">4.8</span>
           </div>
        </div>
        
        <button 
          onClick={handleToggle}
          disabled={busy}
          className={`absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            inCart 
              ? 'bg-slate-900 text-white shadow-lg' 
              : 'bg-white/90 backdrop-blur text-slate-400 hover:text-slate-900 shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={16} fill={inCart ? "currentColor" : "none"} />}
          {animating && (
            <span className="absolute -top-2 -right-2 bg-secondary text-white w-8 h-8 rounded-full flex items-center justify-center animate-pulse shadow-lg pointer-events-none">
              <Check size={14} />
            </span>
          )}
        </button>
      </Link>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex justify-between items-start mb-1">
            <span className="text-[8px] font-black text-secondary uppercase tracking-widest">{product.category.replace('_', ' ')}</span>
            <Activity size={12} className="text-secondary opacity-40" />
          </div>
          <h3 className="text-base font-black font-display text-primary tracking-tight leading-tight group-hover:text-secondary transition-colors">
            {product.name}
          </h3>
          <p className="text-xs font-bold text-on-surface-variant/50 line-clamp-2 leading-relaxed mt-2 italic flex-1">
            {product.specs?.description || 'Standard industrial specifications protocol. High durability output.'}
          </p>
        </div>

        <div className="mt-auto pt-4 border-t border-surface-container-low flex items-center justify-between">
          <div>
            <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-40">Per SQFT</p>
            <p className="text-xl font-black font-display text-primary">₹{product.baseRate}</p>
          </div>
          <Link 
            href={`/dashboard/products/${product.id}`}
            className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center hover:bg-secondary transition-all shadow-md active:scale-90"
          >
            <ShoppingCart size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
