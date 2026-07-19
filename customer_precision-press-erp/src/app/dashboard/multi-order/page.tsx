'use client';


import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RoleGuard } from '@/lib/role-guard';
import { getProductsByCategory } from '@/lib/actions/products';
import { Product } from '@/types/models';
import {
  ArrowRight,
  ChevronLeft,
  Check,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const CATEGORIES = [
  { id: 'solvent', name: 'Solvent Print', description: 'Industrial outdoor banners and hoardings.' },
  { id: 'eco-solvent', name: 'Eco Solvent Print', description: 'High-resolution indoor/outdoor vinyls.' },
  { id: 'uv-roll', name: 'UV Print Roll', description: 'Vibrant roll-to-roll output for premium media.' },
  { id: 'uv-flat', name: 'UV Print Flat', description: 'Direct printing on rigid substrate.' },
  { id: 'digital', name: 'Digital Print', description: 'Fast commercial paper printing.' },
  { id: 'id-cards', name: 'ID Cards', description: 'PVC ID cards and membership cards.' },
];

export default function MultiOrderPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = React.useState(CATEGORIES[0].id);
  const [search, setSearch] = React.useState('');
  const [selectedProducts, setSelectedProducts] = React.useState<Product[]>([]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['multi-order-products', activeCategory],
    queryFn: () => getProductsByCategory(activeCategory),
    enabled: !!activeCategory,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProduct = (product: Product) => {
    setSelectedProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      if (exists) {
        return current.filter((item) => item.id !== product.id);
      }
      return [...current, product];
    });
  };

  const continueToOrder = () => {
    if (selectedProducts.length === 0) {
      toast.error('Select at least one product first.');
      return;
    }

    router.push(`/dashboard/new-order?mode=multi&productIds=${selectedProducts.map((item) => item.id).join(',')}`);
  };

  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/customer" className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm hover:shadow-md transition-all active:scale-95">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-1">Multi Order Flow</p>
              <h1 className="text-3xl font-black font-display text-primary tracking-tighter">Pick several products, then configure each one</h1>
            </div>
          </div>

          <button
            onClick={continueToOrder}
            className="inline-flex items-center gap-3 rounded-2xl bg-primary px-6 py-4 text-[10px] font-black uppercase tracking-[0.25em] text-white shadow-lg shadow-primary/20 hover:bg-secondary transition-all"
          >
            Continue to Configure
            <ArrowRight size={16} />
          </button>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-surface-container-low bg-surface-container-lowest p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black font-display text-primary tracking-tight">Choose a category</h2>
                  <p className="text-xs font-medium text-on-surface-variant/50 mt-1">Switch categories and keep adding products to the same order.</p>
                </div>

                <div className="relative w-full lg:w-[22rem]">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant/30" size={18} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search products in this category"
                    className="w-full rounded-2xl border-none bg-surface-container-low px-14 py-4 text-sm font-bold text-primary placeholder:text-on-surface-variant/30 focus:ring-4 focus:ring-secondary/10"
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`rounded-[1.5rem] border p-4 text-left transition-all ${
                      activeCategory === category.id
                        ? 'border-primary bg-primary text-white shadow-lg shadow-primary/15'
                        : 'border-surface-container-low bg-white hover:border-secondary hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-[9px] font-black uppercase tracking-[0.3em] ${activeCategory === category.id ? 'text-white/70' : 'text-secondary'}`}>
                          Category
                        </p>
                        <h3 className="mt-1 text-base font-black font-display tracking-tight">{category.name}</h3>
                      </div>
                      {activeCategory === category.id ? <Check size={18} /> : <Plus size={18} />}
                    </div>
                    <p className={`mt-3 text-xs leading-relaxed ${activeCategory === category.id ? 'text-white/75' : 'text-on-surface-variant/60'}`}>
                      {category.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-surface-container-low bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-black font-display text-primary tracking-tight">Products</h2>
                  <p className="text-xs font-medium text-on-surface-variant/45 mt-1">Tap items to add or remove them from the shared order.</p>
                </div>
                <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-secondary">
                  {filtered.length} Available
                </span>
              </div>

              {isLoading ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  <Loader2 className="animate-spin text-primary" size={28} />
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map((product) => {
                    const selected = selectedProducts.some((item) => item.id === product.id);
                    return (
                      <button
                        key={product.id}
                        onClick={() => toggleProduct(product)}
                        className={`group rounded-[1.5rem] border p-4 text-left transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                            : 'border-surface-container-low bg-surface-container-lowest hover:border-secondary hover:-translate-y-1'
                        }`}
                      >
                        <div className="h-32 overflow-hidden rounded-[1.1rem] bg-surface-container-low">
                          <img
                            src={product.media?.images?.[0] || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=400'}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        </div>
                        <div className="mt-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-secondary">{String(product.category || '').replace('_', ' ')}</p>
                            <h3 className="mt-1 text-sm font-black font-display tracking-tight text-primary">{product.name}</h3>
                            <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-on-surface-variant/55">
                              {product.specs?.description || 'Standard industrial specifications protocol.'}
                            </p>
                          </div>
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-primary text-white' : 'bg-surface-container-low text-primary'}`}>
                            {selected ? <Check size={16} /> : <Plus size={16} />}
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-surface-container-low pt-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant/35">Base rate</p>
                          <p className="text-lg font-black font-display text-primary">₹{product.baseRate}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 self-start">
            <div className="rounded-[2rem] border border-surface-container-low bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-secondary">Selection Tray</p>
                  <h2 className="mt-1 text-xl font-black font-display text-primary tracking-tight">{selectedProducts.length} item(s) ready</h2>
                </div>
                <ShoppingBag className="text-primary/30" size={24} />
              </div>

              {selectedProducts.length === 0 ? (
                <div className="mt-5 rounded-[1.25rem] border border-dashed border-surface-container-low bg-surface-container-lowest p-4 text-sm font-medium text-on-surface-variant/50">
                  Select products from the grid to build a single multi-item order.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {selectedProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-[1.15rem] border border-surface-container-low bg-surface-container-lowest p-3">
                      <img
                        src={product.media?.images?.[0] || 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=400'}
                        alt={product.name}
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black font-display text-primary">{product.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40">₹{product.baseRate}</p>
                      </div>
                      <button
                        onClick={() => toggleProduct(product)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-on-surface-variant/45 hover:bg-error hover:text-white transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={continueToOrder}
                className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 text-[10px] font-black uppercase tracking-[0.25em] text-white shadow-lg shadow-primary/20 hover:bg-secondary transition-all"
              >
                Continue to Configure
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="rounded-[2rem] border border-surface-container-low bg-surface-container-lowest p-5 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-secondary">How it works</p>
              <ol className="mt-4 space-y-3 text-sm font-medium text-on-surface-variant/70">
                <li className="flex gap-3"><span className="font-black text-primary">01</span> Pick items from one or many categories.</li>
                <li className="flex gap-3"><span className="font-black text-primary">02</span> Continue to the existing order builder.</li>
                <li className="flex gap-3"><span className="font-black text-primary">03</span> Configure each row separately, then submit once.</li>
              </ol>
            </div>
          </aside>
        </section>
      </div>
    </RoleGuard>
  );
}
