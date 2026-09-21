'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import {
  Printer,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Tag,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  X,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getRoleGlobalOrdersUrl } from '@/config/navigation';
import {
  PrintingCategory,
  getPrintingCategories,
  createPrintingCategory,
  updatePrintingCategory,
  deletePrintingCategory,
} from '@/lib/actions/printing-categories';

export default function PrintingCategoriesPage() {
  const router = useRouter();
  const { profile, roles, loading: authLoading } = useAuth();

  const userRoles = useMemo(() => {
    return [profile?.role, ...(roles || [])].filter(Boolean).map((r) => String(r).toUpperCase());
  }, [profile?.role, roles]);

  const isAdmin = userRoles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

  // Access guard
  useEffect(() => {
    if (!authLoading && (!profile || !isAdmin)) {
      toast.error('Access restricted to Administrators.');
      const fallback = getRoleGlobalOrdersUrl(profile?.role || 'CUSTOMER');
      router.replace(fallback);
    }
  }, [authLoading, profile, isAdmin, router]);

  const [categories, setCategories] = useState<PrintingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [hasSubcategories, setHasSubcategories] = useState(false);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [newSubInput, setNewSubInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getPrintingCategories(true);
      setCategories(data);
    } catch (err) {
      toast.error('Failed to load printing categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadCategories();
    }
  }, [isAdmin]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormName('');
    setHasSubcategories(false);
    setSubcategories([]);
    setNewSubInput('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: PrintingCategory) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setHasSubcategories(cat.has_subcategories);
    setSubcategories((cat.subcategories || []).map((s) => s.name));
    setNewSubInput('');
    setIsModalOpen(true);
  };

  const handleAddSubcategory = () => {
    const val = newSubInput.trim();
    if (!val) return;
    if (subcategories.some((s) => s.toLowerCase() === val.toLowerCase())) {
      toast.error('Subcategory already exists in this list.');
      return;
    }
    setSubcategories([...subcategories, val]);
    setNewSubInput('');
  };

  const handleRemoveSubcategory = (index: number) => {
    setSubcategories(subcategories.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Category Name is required.');
      return;
    }

    if (hasSubcategories && subcategories.length === 0) {
      toast.error('Please add at least one subcategory or toggle "Need Sub-categories" to No.');
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        const res = await updatePrintingCategory(editingId, {
          name: formName.trim(),
          has_subcategories: hasSubcategories,
          subcategories: hasSubcategories ? subcategories : [],
        });
        if (!res.success) {
          toast.error(res.error || 'Failed to update category.');
          return;
        }
        toast.success('Printing category updated successfully.');
      } else {
        const res = await createPrintingCategory({
          name: formName.trim(),
          has_subcategories: hasSubcategories,
          subcategories: hasSubcategories ? subcategories : [],
        });
        if (!res.success) {
          toast.error(res.error || 'Failed to create category.');
          return;
        }
        toast.success('Printing category created successfully.');
      }

      setIsModalOpen(false);
      loadCategories();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save printing category.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: PrintingCategory) => {
    try {
      const res = await updatePrintingCategory(cat.id, {
        is_active: !cat.is_active,
      });
      if (res.success) {
        toast.success(`Category marked as ${!cat.is_active ? 'active' : 'inactive'}.`);
        loadCategories();
      } else {
        toast.error(res.error || 'Failed to update status.');
      }
    } catch (err) {
      toast.error('Failed to toggle active status.');
    }
  };

  const handleDelete = async (cat: PrintingCategory) => {
    if (!window.confirm(`Are you sure you want to delete printing category "${cat.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await deletePrintingCategory(cat.id);
      if (res.success) {
        toast.success('Category deleted successfully.');
        loadCategories();
      } else {
        toast.error(res.error || 'Failed to delete category.');
      }
    } catch (err) {
      toast.error('Failed to delete category.');
    }
  };

  if (authLoading || (!isAdmin && profile)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm text-slate-500 font-medium">Verifying administrator credentials...</p>
      </div>
    );
  }

  const totalSubsCount = categories.reduce((sum, c) => sum + (c.subcategories?.length || 0), 0);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/orders')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Admin Orders"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="p-2.5 bg-purple-100 dark:bg-purple-950/60 rounded-xl text-purple-700 dark:text-purple-300">
            <Printer className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Printing Categories & Flow Creator
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define dynamic printing streams and subcategories for machine routing and staff printer queues.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow transition-all"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New Printing Category</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Categories</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{categories.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Categories</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {categories.filter((c) => c.is_active).length}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-lg">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Subcategories</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalSubsCount}</p>
          </div>
        </div>
      </div>

      {/* Main Categories List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs text-slate-500">Loading printing categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-6">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Printer className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No printing categories configured</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Create your first printing category (e.g., Solvent, UV Flatbed, Eco Solvent) to assign to items and route to printer staff.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
          >
            <Plus className="h-4 w-4" />
            Add First Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => {
            const subs = cat.subcategories || [];
            return (
              <div
                key={cat.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border ${
                  cat.is_active
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-dashed border-slate-300 dark:border-slate-800 opacity-75'
                } p-5 flex flex-col justify-between transition-all hover:border-blue-300 dark:hover:border-blue-900`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">{cat.name}</h3>
                        {!cat.is_active && (
                          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      <span className="inline-block font-mono text-[11px] text-slate-400 dark:text-slate-500 uppercase mt-0.5">
                        CODE: {cat.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleActive(cat)}
                        title={cat.is_active ? 'Click to deactivate' : 'Click to activate'}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {cat.is_active ? (
                          <ToggleRight className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-slate-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(cat)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 hover:text-blue-600 transition-colors"
                        title="Edit category & subcategories"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-medium text-slate-600 dark:text-slate-400">Sub-categories:</span>
                      <span className="text-[11px] text-slate-400">
                        {cat.has_subcategories ? `${subs.length} items` : 'None (Direct stream)'}
                      </span>
                    </div>

                    {cat.has_subcategories && subs.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {subs.map((sub) => (
                          <span
                            key={sub.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60"
                          >
                            <Tag className="h-3 w-3 text-purple-400" />
                            {sub.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2.5 border border-dashed border-slate-200 dark:border-slate-800">
                        Standard stream without sub-tiers. Orders route directly under {cat.name}.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Role Filter: PRINTER</span>
                  <span>Queue: Active</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Category */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {editingId ? 'Edit Printing Category' : 'New Printing Category'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Category Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Solvent, Eco Solvent, UV Flatbed..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Subcategories Switch */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Need Sub-categories?</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Allows creating sub-tiers (e.g. Frontlit, Backlit) under this category.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHasSubcategories(!hasSubcategories)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      hasSubcategories ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        hasSubcategories ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Subcategory builder */}
                {hasSubcategories && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-200">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type subcategory name (e.g. Frontlit)..."
                        value={newSubInput}
                        onChange={(e) => setNewSubInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubcategory();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddSubcategory}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>

                    {/* Chips list */}
                    {subcategories.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 pt-1">
                        {subcategories.map((sub, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800"
                          >
                            <span>{sub}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSubcategory(idx)}
                              className="hover:text-red-600 dark:hover:text-red-400 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        At least 1 subcategory is needed when subcategories are enabled.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-all"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingId ? 'Save Changes' : 'Create Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
