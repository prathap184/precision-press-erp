'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@/types/models';
import { getAdminProductsByCategory, createProduct, updateProduct, softDeleteProduct, refreshProductGST } from '@/lib/actions/products';
import { getActiveHSNsAction } from '@/lib/actions/hsn';

const DEFAULT_WORKFLOW_STEPS = [
  { id: 'step-accountant', role: 'ACCOUNTANT', label: 'Accounts Approval', blocking: true },
  { id: 'step-designer', role: 'DESIGNER', label: 'Design & Artwork', blocking: true },
  { id: 'step-manager', role: 'MANAGER', label: 'Manager Sign-Off', blocking: true },
  { id: 'step-printer', role: 'PRINTER', label: 'Printing', blocking: true },
  { id: 'step-pasting', role: 'PASTING', label: 'Pasting', blocking: true },
  { id: 'step-dispatch', role: 'DISPATCH', label: 'Dispatch', blocking: true },
  { id: 'step-delivery', role: 'DELIVERY', label: 'Delivery', blocking: false }
] as any;

const CATEGORIES = [
  { id: 'SOLVENT', name: 'Solvent Print', img: '/images/categories/solvent.png', color: 'from-blue-600/20 to-blue-900/20' },
  { id: 'ECO_SOLVENT', name: 'Eco Solvent', img: '/images/categories/eco-solvent.png', color: 'from-emerald-600/20 to-emerald-900/20' },
  { id: 'UV_ROLL', name: 'UV Roll', img: '/images/categories/uv-roll.png', color: 'from-indigo-600/20 to-indigo-900/20' },
  { id: 'UV_FLAT', name: 'UV Flat', img: '/images/categories/uv-flat.png', color: 'from-purple-600/20 to-purple-900/20' },
  { id: 'DIGITAL', name: 'Digital Print', img: '/images/categories/digital.png', color: 'from-amber-600/20 to-amber-900/20' },
  { id: 'ID_CARDS', name: 'ID Cards', img: '/images/categories/id-cards.png', color: 'from-rose-600/20 to-rose-900/20' }
];
import { Plus, Edit2, Trash2, X, Save, Video, Image as ImageIcon, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { WorkflowBuilder } from './WorkflowBuilder';
import { ALL_PRINTER_CATEGORIES, PRINTER_CATEGORY_META, PrinterCategory } from '@/types/roles';

export default function ProductManagement() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Search and Pagination State
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState(''); // Only execute search when user hits "Enter" or "Search" button
  const [pageCursors, setPageCursors] = useState<string[]>(['']);
  const [currentPage, setCurrentPage] = useState(0);

  // Triggered when hitting Enter in search or clicking the search button
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveSearch(searchInput);
    setCurrentPage(0);
    setPageCursors(['']);
  };

  // Reset pagination when category changes
  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    setSearchInput('');
    setActiveSearch('');
    setCurrentPage(0);
    setPageCursors(['']);
  };

  const handleNextPage = () => {
    if (products.length < 50) return; // No more pages
    const lastId = products[products.length - 1].id;
    setPageCursors((prev) => {
      const newCursors = [...prev];
      newCursors[currentPage + 1] = lastId;
      return newCursors;
    });
    setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const { data: products = [], isLoading: loading, isFetching } = useQuery({
    queryKey: ['admin-products', selectedCategory, activeSearch, pageCursors[currentPage]],
    queryFn: () => getAdminProductsByCategory(selectedCategory!, activeSearch, pageCursors[currentPage]),
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedCategory,
  });

  const { data: hsnList = [] } = useQuery({
    queryKey: ['active-hsns'],
    queryFn: () => getActiveHSNsAction(),
    staleTime: 5 * 60 * 1000,
  });

  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [editingProductOriginalId, setEditingProductOriginalId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct({
        ...product,
        workflowSteps: product.workflowSteps?.length ? product.workflowSteps : DEFAULT_WORKFLOW_STEPS
      });
      setEditingProductOriginalId(product.id);
    } else {
      setEditingProduct({
        id: '',
        name: '',
        category: selectedCategory || 'SOLVENT',
        baseRate: 0,
        eyeletPricing: { metal: 0, plastic: 0, none: 0 },
        deliveryPricing: { door: 0, courier: 0, transport: 0, selfPickup: 0 },
        media: { images: [] },
        specs: { description: '' },
        status: 'ACTIVE',
        printerCategory: 'SOLVENT_PRINT',
        workflowSteps: DEFAULT_WORKFLOW_STEPS,
        hsn_code: '',
        hsn_description: '',
        gst_rate: undefined,
        gst_effective_from: undefined
      });
      setEditingProductOriginalId(null);
    }
    setIsModalOpen(true);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setFormError(null);

    try {
      setIsSaving(true);
      if (editingProductOriginalId !== null) {
        const originalId = editingProductOriginalId;
        const res = await updateProduct(originalId, editingProduct);
        if (!res.success) { setFormError(res.error || 'Update failed'); return; }
        toast.success('Product updated successfully!');
      } else {
        const res = await createProduct(editingProduct);
        if (!res.success) { setFormError(res.error || 'Create failed'); return; }
        toast.success('Product created successfully!');
      }
      setIsModalOpen(false);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unexpected error. Please try again.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshGST = async (id: string) => {
    try {
      setIsSaving(true);
      const res = await refreshProductGST(id, 'ADMIN');
      if (!res.success) throw new Error(res.error);
      toast.success("GST rate refreshed from HSN master");
      
      // Update local state if currently editing this product
      if (editingProduct?.id === id) {
         setEditingProduct({ ...editingProduct, ...res });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Refresh failed';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this product?")) return;
    try {
      setIsSaving(true);
      const res = await softDeleteProduct(id);
      if (!res.success) throw new Error(res.error);
      toast.success("Product deactivated");
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Delete failed';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-800 uppercase">Product Management</h1>
          <p className="text-xs text-slate-500">Configure industrial pricing & product catalog</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase px-3 py-1.5 bg-slate-100 rounded border border-slate-200"
            >
              ← Back to Categories
            </button>
          )}
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all shadow-sm"
          >
            <Plus size={14} />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {!selectedCategory ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className="group relative h-20 rounded border border-slate-200 overflow-hidden shadow-sm transition-all hover:border-slate-300"
            >
              <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 opacity-90 group-hover:scale-105 group-hover:opacity-100" />
              <div className={`absolute inset-0 bg-gradient-to-br ${cat.color} opacity-80`} />
              <div className="absolute inset-0 bg-slate-900/60 transition-colors" />
              <div className="absolute inset-x-0 bottom-0 p-2 text-left">
                <h2 className="text-[10px] font-bold text-white uppercase tracking-wider">{cat.name}</h2>
              </div>
            </button>
          ))}
        </div>
      ) : (
      <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col">
        {/* Search Bar */}
        <div className="p-2 border-b border-slate-200 bg-slate-50 flex gap-2 items-center">
          <form onSubmit={handleSearch} className="flex-1 max-w-sm relative">
            <input
              type="text"
              placeholder="Search products..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs outline-none border border-slate-300 rounded focus:ring-1 focus:ring-slate-500 transition-all font-medium bg-white"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </form>
          {activeSearch && (
            <span className="text-[10px] font-bold text-slate-600 bg-slate-200 border border-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">
              Search: "{activeSearch}"
            </span>
          )}
        </div>

        {/* Table Area */}
        <div className="relative min-h-[300px]">
          {(loading || isFetching) && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
            </div>
          )}
          
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200">Product ID</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200">Name</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200">Category</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200">Base Rate</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200">Status</th>
                <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 font-medium text-xs tabular-nums">
                    No products found matching your criteria.
                  </td>
                </tr>
              )}
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors text-xs">
                  <td className="px-3 py-1.5 font-mono font-semibold text-slate-700 border-r border-slate-100 tabular-nums">{product.id}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-900 border-r border-slate-100 tabular-nums">{product.name}</td>
                  <td className="px-3 py-1.5 text-slate-600 text-[10px] uppercase font-bold border-r border-slate-100 tabular-nums">{product.category}</td>
                  <td className="px-3 py-1.5 font-semibold border-r border-slate-100 tabular-nums">₹{product.baseRate}<span className="text-[10px] text-slate-400 font-normal">/sqft</span></td>
                  <td className="px-3 py-1.5 border-r border-slate-100 tabular-nums">
                    <div className="flex flex-col gap-0.5">
                      <span className={`px-1.5 py-0.5 w-max rounded text-[9px] font-bold uppercase tracking-wider ${
                        product.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {product.status}
                      </span>
                      {product.hsn_code && (
                        <span className="text-[9px] text-slate-500 font-medium">
                          GST: {product.gst_rate}% (HSN {product.hsn_code})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleOpenModal(product)}
                        className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-all"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                        title="Deactivate"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Page {currentPage + 1} • <span className="text-slate-700">{products.length} visible</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0 || loading || isFetching}
              className="flex items-center gap-1 px-3 py-1 border border-slate-200 bg-white rounded text-[10px] font-bold uppercase hover:bg-slate-100 disabled:opacity-50 transition-all text-slate-700"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={products.length < 50 || loading || isFetching}
              className="flex items-center gap-1 px-3 py-1 border border-slate-200 bg-white rounded text-[10px] font-bold uppercase hover:bg-slate-100 disabled:opacity-50 transition-all text-slate-700"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Product Modal Form */}
      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingProductOriginalId !== null ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Basic Info SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Product ID (Mandatory)</label>
                  <input
                    required
                    value={editingProduct.id}
                    onChange={(e) => setEditingProduct({ ...editingProduct, id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="e.g. 6000"
                  />
                  {editingProductOriginalId && editingProductOriginalId !== editingProduct.id && (
                    <p className="mt-2 text-[10px] text-amber-700">Changing the Product ID will rename the product document and update active cart/wishlist references.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Product Name</label>
                  <input
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Sol Frontlit Flex 180"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="SOLVENT">Solvent Print</option>
                    <option value="ECO_SOLVENT">Eco Solvent</option>
                    <option value="UV_ROLL">UV Roll</option>
                    <option value="UV_FLAT">UV Flat</option>
                    <option value="DIGITAL">Digital Print</option>
                    <option value="ID_CARDS">ID Cards</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Printer Machine Category</label>
                  <select
                    value={editingProduct.printerCategory || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, printerCategory: e.target.value as PrinterCategory })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="" disabled>Select Machine...</option>
                    {ALL_PRINTER_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{PRINTER_CATEGORY_META[cat].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Base Rate (₹ / sqft)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={editingProduct.baseRate}
                    onChange={(e) => setEditingProduct({ ...editingProduct, baseRate: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-600"
                  />
                </div>

                <div className="md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4 mt-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                     <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">HSN & Tax Configuration</h3>
                     {editingProductOriginalId && editingProduct.hsn_code && (
                       <button
                         type="button"
                         onClick={() => handleRefreshGST(editingProductOriginalId!)}
                         className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 font-bold uppercase transition-colors"
                         disabled={isSaving}
                       >
                         <Loader2 size={12} className={isSaving ? 'animate-spin' : 'hidden'} />
                         Refresh GST from Master
                       </button>
                     )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">HSN Code</label>
                      <input
                        list="hsn-list"
                        value={editingProduct.hsn_code || ''}
                        placeholder="Type to search HSN..."
                        onChange={(e) => {
                          const val = e.target.value;
                          const selectedHsn = hsnList.find((h: any) => h.hsn_code === val);
                          setEditingProduct({ 
                            ...editingProduct, 
                            hsn_code: val,
                            hsn_description: selectedHsn ? selectedHsn.description : '',
                            gst_rate: selectedHsn ? selectedHsn.current_rate?.gst_rate : undefined
                          });
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                      <datalist id="hsn-list">
                        {hsnList.map((hsn: any) => (
                          <option key={hsn.id} value={hsn.hsn_code}>
                            {hsn.hsn_code} - {hsn.description}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">HSN Description</label>
                      <input
                        disabled
                        value={editingProduct.hsn_description || 'Auto-fetched on save'}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-100 text-slate-500 italic"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Current GST Rate</label>
                      <input
                        disabled
                        value={editingProduct.gst_rate ? `${editingProduct.gst_rate}%` : 'Pending'}
                        className="w-full px-3 py-1.5 text-sm font-bold border border-slate-200 rounded bg-slate-100 text-slate-700"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    <span className="font-bold text-slate-700">Note:</span> GST rate is managed centrally. Enter the HSN Code and save. The system will automatically fetch the exact GST rate and HSN description from the HSN Master on save. To update GST rates later, use the Refresh button.
                  </p>
                </div>
              </div>

              {/* EYELET PRICING SECTION */}
              <div className="bg-blue-50/50 p-6 rounded-xl space-y-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Plus size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Eyelet Pricing (₹ per unit)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Metal</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingProduct.eyeletPricing?.metal}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        eyeletPricing: { ...editingProduct.eyeletPricing!, metal: parseFloat(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Plastic</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingProduct.eyeletPricing?.plastic}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        eyeletPricing: { ...editingProduct.eyeletPricing!, plastic: parseFloat(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">None</label>
                    <input
                      disabled
                      value="0"
                      className="w-full px-4 h-11 border border-slate-200 rounded-lg bg-slate-50 text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* DELIVERY PRICING SECTION */}
              <div className="bg-amber-50/50 p-6 rounded-xl space-y-4 border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon size={16} className="text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider">Delivery Pricing (₹ Flat Rate)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Door Delivery</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingProduct.deliveryPricing?.door}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        deliveryPricing: { ...editingProduct.deliveryPricing!, door: parseFloat(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Courier</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingProduct.deliveryPricing?.courier}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        deliveryPricing: { ...editingProduct.deliveryPricing!, courier: parseFloat(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Transport</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingProduct.deliveryPricing?.transport}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        deliveryPricing: { ...editingProduct.deliveryPricing!, transport: parseFloat(e.target.value) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg shadow-sm"
                    />
                  </div>
                </div>
              </div>
              {/* PRODUCTION WORKFLOW SECTION */}
              <div className="bg-indigo-50/50 p-6 rounded-xl space-y-4 border border-indigo-100">
                <WorkflowBuilder 
                  steps={editingProduct.workflowSteps || []}
                  onChange={(steps) => setEditingProduct({ ...editingProduct, workflowSteps: steps })}
                />
              </div>

              {/* MEDIA & SPECS SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <ImageIcon size={18} />
                    <span>Media Assets</span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Image URLs (Comma separated)</label>
                    <textarea
                      value={editingProduct.media?.images.join(', ')}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        media: { ...editingProduct.media!, images: e.target.value.split(',').map(s => s.trim()) }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg min-h-[80px]"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Video URL (Optional)</label>
                    <input
                      value={editingProduct.media?.video?.url || ''}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        media: { ...editingProduct.media!, video: { url: e.target.value } }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <Video size={18} />
                    <span>Product Specs</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Max Width</label>
                      <input
                        value={editingProduct.specs?.maxWidth || ''}
                        onChange={(e) => setEditingProduct({
                          ...editingProduct,
                          specs: { ...editingProduct.specs!, maxWidth: e.target.value }
                        })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        placeholder="e.g. 10ft"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">GSM</label>
                      <input
                        value={editingProduct.specs?.gsm || ''}
                        onChange={(e) => setEditingProduct({
                          ...editingProduct,
                          specs: { ...editingProduct.specs!, gsm: e.target.value }
                        })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                        placeholder="e.g. 180"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Description</label>
                    <textarea
                      value={editingProduct.specs?.description || ''}
                      onChange={(e) => setEditingProduct({
                        ...editingProduct,
                        specs: { ...editingProduct.specs!, description: e.target.value }
                      })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              {/* Inline Error Banner */}
              {formError && (
                <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-3">
                  <span className="text-red-600 font-bold text-lg leading-none mt-0.5">✕</span>
                  <p className="text-red-700 font-semibold text-sm">{formError}</p>
                </div>
              )}

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 h-11 rounded-lg font-bold shadow-lg shadow-blue-200 disabled:opacity-50 transition-all"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  {isSaving ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
