'use client';


import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Info, 
  ShieldCheck, 
  Clock, 
  Package,
  ArrowRight,
  Star,
  FileText,
  AlertCircle,
  ShoppingCart,
  Check,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { toggleCart, getCartStatus } from '@/lib/actions/cart';
import { toggleCartClient } from '@/lib/client-cart';
import { toast } from 'sonner';
import { OrderBuilder } from '@/components/dashboard/OrderBuilder';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, limit, getDocs } from '@/lib/supabase-firestore-shim';
import { Product } from '@/types/models';

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();
  const [inCart, setInCart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      setLoading(true);
      try {
        // Fetch Main Product
        const docRef = doc(db, 'products', id as string);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setError('Product not found.');
          setLoading(false);
          return;
        }

        const productData = { id: docSnap.id, ...docSnap.data() } as Product;
        setProduct(productData);

        // Fetch Similar Products (same category)
        const similarQuery = query(
          collection(db, 'products'),
          where('category', '==', productData.category),
          where('status', '==', 'ACTIVE'),
          limit(4)
        );
        const similarSnap = await getDocs(similarQuery);
        const similarList = similarSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Product))
          .filter(p => p.id !== productData.id);
        
        setSimilarProducts(similarList);
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Failed to load product details.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (profile?.uid && id) {
      getCartStatus(profile.uid, id as string).then(setInCart);
    }
  }, [profile?.uid, id]);

  const handleToggle = async () => {
    if (!profile?.uid || !product) {
      toast.error('Please login to add to cart');
      return;
    }
    // start the click animation immediately (optimistic)
    setAnimating(true);
    // safety: stop animation after 1.2s if background hasn't finished
    const animTimer = setTimeout(() => setAnimating(false), 1200);
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
    const optimistic = !inCart;
    setInCart(optimistic);
    toast.success(optimistic ? 'Added to cart' : 'Removed from cart');

    // Fire server action in background; if it fails, try client fallback and revert if necessary
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

  const [activeImage, setActiveImage] = useState<string>('');

  useEffect(() => {
    if (product?.media?.images?.[0]) {
      setActiveImage(product.media.images[0]);
    }
  }, [product]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black text-primary uppercase tracking-[0.4em] animate-pulse">Initializing Protocol...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8">
        <div className="w-20 h-20 bg-error-container text-error rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={40} />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-black text-primary uppercase tracking-tighter mb-2">Protocol Failure</h2>
          <p className="text-on-surface-variant font-medium opacity-60 italic">{error || 'Product data unavailable.'}</p>
        </div>
        <button 
          onClick={() => router.back()}
          className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 flex items-center gap-4"
        >
          <ChevronLeft size={18} />
          Emergency Return
        </button>
      </div>
    );
  }

  const allImages = product.media?.images || [];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm hover:shadow-md transition-all active:scale-95 border border-surface-container-low">
              <ChevronLeft size={20} />
            </button>
            <div>
              <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-1">Material Catalog</p>
              <h1 className="text-3xl font-black font-display text-primary tracking-tighter italic uppercase">SKU: {product.id}</h1>
            </div>
          </div>
          
          <button 
            onClick={handleToggle}
            disabled={busy}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 ${
              inCart 
                ? 'bg-slate-900 text-white' 
                : 'bg-white text-slate-400 hover:text-slate-900 border border-slate-100'
            }`}
          >
            {busy ? <Loader2 className="animate-spin" size={20} /> : <ShoppingCart size={24} fill={inCart ? "currentColor" : "none"} />}
            {animating && (
              <span className="absolute -top-2 -right-2 bg-secondary text-white w-9 h-9 rounded-full flex items-center justify-center animate-pulse shadow-lg pointer-events-none">
                <Check size={16} />
              </span>
            )}
          </button>
        </div>

        {/* Combined Order Configurator (The Engine) */}
        <div id="order-section" className="pt-8 border-t border-surface-container-low">
          <React.Suspense fallback={<div className="p-20 text-center font-black animate-pulse opacity-40 uppercase tracking-[0.4em]">Booting Order Engine...</div>}>
            <OrderBuilder lockedProduct={product} />
          </React.Suspense>
        </div>

        {/* Similar Products Suggestions */}
        {similarProducts.length > 0 && (
          <section className="space-y-10 pt-10 border-t border-surface-container-low">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end px-2 gap-6 mb-2">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-4">Vertical Affinity</p>
                <h3 className="text-4xl font-black font-display text-primary tracking-tighter mb-4">Similar Protocols</h3>
                <p className="text-[13px] font-bold text-on-surface-variant/60 leading-relaxed">
                  Explore alternative industrial configurations that share similar base materials, durability ratings, and execution protocols within this manufacturing category. Compare base specs below.
                </p>
              </div>
              <Link href="/dashboard/categories" className="text-[11px] font-black text-primary hover:text-white bg-surface-container-low hover:bg-secondary px-6 py-3 rounded-2xl flex items-center gap-3 transition-all active:scale-95 group shadow-sm mb-1 whitespace-nowrap">
                Browse Full Catalog <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {similarProducts.map((item) => (
                <Link 
                  key={item.id} 
                  href={`/dashboard/products/${item.id}`}
                  className="group bg-surface-container-lowest p-5 rounded-[2.5rem] border border-surface-container-low hover:border-secondary transition-all shadow-sm hover:shadow-xl flex flex-col h-full"
                >
                  <div className="aspect-square rounded-3xl overflow-hidden mb-6 bg-surface-container-low flex-shrink-0 relative">
                    <img src={item.media?.images?.[0] || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                      <span className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-[9px] font-black text-primary uppercase tracking-widest shadow-sm">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col">
                    <h4 className="text-lg font-black font-display text-primary tracking-tight mb-2 group-hover:text-secondary transition-colors underline decoration-transparent group-hover:decoration-secondary">
                      {item.name}
                    </h4>
                    
                    <p className="text-[11px] font-bold text-on-surface-variant/50 line-clamp-2 leading-relaxed mb-6 flex-1 italic">
                      {item.specs?.description || 'Standard industrial specifications protocol. High durability output.'}
                    </p>

                    <div className="flex justify-between items-end mt-auto pt-5 border-t border-surface-container-low border-dashed">
                      <div>
                        <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-40 mb-1">Base Rate</p>
                        <p className="text-2xl font-black font-display text-primary tracking-tighter">₹{item.baseRate}<span className="text-[9px] uppercase tracking-widest opacity-30 ml-2">/ SQFT</span></p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    );
}

