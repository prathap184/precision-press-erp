'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export interface PrintingSubcategory {
  id: string;
  category_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

export interface PrintingCategory {
  id: string;
  name: string;
  code: string;
  has_subcategories: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subcategories?: PrintingSubcategory[];
}

function slugify(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Fetch all printing categories, optionally including inactive ones.
 * Automatically fetches active subcategories attached to each category.
 */
export async function getPrintingCategories(includeInactive = false): Promise<PrintingCategory[]> {
  try {
    let query = supabaseServer
      .from('printing_categories')
      .select('id, name, code, has_subcategories, is_active, created_at, updated_at')
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: categories, error: catErr } = await query;
    if (catErr) {
      console.error('[getPrintingCategories] Error fetching categories:', catErr);
      return [];
    }

    if (!categories || categories.length === 0) {
      return [];
    }

    // Fetch subcategories
    let subQuery = supabaseServer
      .from('printing_subcategories')
      .select('id, category_id, name, code, is_active, created_at')
      .order('name', { ascending: true });

    if (!includeInactive) {
      subQuery = subQuery.eq('is_active', true);
    }

    const { data: subcategories, error: subErr } = await subQuery;
    if (subErr) {
      console.error('[getPrintingCategories] Error fetching subcategories:', subErr);
    }

    const subMap = new Map<string, PrintingSubcategory[]>();
    (subcategories || []).forEach((sub: any) => {
      const list = subMap.get(sub.category_id) || [];
      list.push(sub);
      subMap.set(sub.category_id, list);
    });

    return categories.map((cat: any) => ({
      ...cat,
      subcategories: subMap.get(cat.id) || [],
    }));
  } catch (err: any) {
    console.error('[getPrintingCategories] Unexpected error:', err);
    return [];
  }
}

/**
 * Create a new printing category and optional initial subcategories.
 */
export async function createPrintingCategory(data: {
  name: string;
  code?: string;
  has_subcategories?: boolean;
  subcategories?: string[];
}): Promise<{ success: boolean; data?: PrintingCategory; error?: string }> {
  try {
    const name = data.name.trim();
    if (!name) {
      return { success: false, error: 'Category name is required.' };
    }

    const code = data.code?.trim() || slugify(name);
    const hasSubs = Boolean(data.has_subcategories && data.subcategories && data.subcategories.length > 0);

    const { data: inserted, error: insertErr } = await supabaseServer
      .from('printing_categories')
      .insert({
        name,
        code,
        has_subcategories: hasSubs,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) {
      return { success: false, error: insertErr.message };
    }

    // Insert subcategories if provided
    if (hasSubs && data.subcategories && data.subcategories.length > 0) {
      const subsToInsert = data.subcategories
        .map((s) => s.trim())
        .filter(Boolean)
        .map((subName) => ({
          category_id: inserted.id,
          name: subName,
          code: slugify(subName),
          is_active: true,
        }));

      if (subsToInsert.length > 0) {
        const { error: subInsertErr } = await supabaseServer
          .from('printing_subcategories')
          .insert(subsToInsert);

        if (subInsertErr) {
          console.error('[createPrintingCategory] Subcategories insert error:', subInsertErr);
        }
      }
    }

    revalidatePath('/admin/printing-categories');
    return { success: true, data: inserted };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create printing category.' };
  }
}

/**
 * Update an existing printing category and its subcategories.
 */
export async function updatePrintingCategory(
  id: string,
  data: {
    name?: string;
    code?: string;
    has_subcategories?: boolean;
    is_active?: boolean;
    subcategories?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updatePayload.name = data.name.trim();
      if (!updatePayload.name) {
        return { success: false, error: 'Category name cannot be empty.' };
      }
    }

    if (data.code !== undefined) {
      updatePayload.code = data.code.trim();
    } else if (data.name) {
      updatePayload.code = slugify(data.name);
    }

    if (data.has_subcategories !== undefined) {
      updatePayload.has_subcategories = data.has_subcategories;
    }

    if (data.is_active !== undefined) {
      updatePayload.is_active = data.is_active;
    }

    const { error: updateErr } = await supabaseServer
      .from('printing_categories')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // If subcategories list provided, replace subcategories
    if (data.subcategories !== undefined) {
      // Delete existing subcategories
      await supabaseServer.from('printing_subcategories').delete().eq('category_id', id);

      if (data.has_subcategories && data.subcategories.length > 0) {
        const validSubs = data.subcategories
          .map((s) => s.trim())
          .filter(Boolean)
          .map((subName) => ({
            category_id: id,
            name: subName,
            code: slugify(subName),
            is_active: true,
          }));

        if (validSubs.length > 0) {
          await supabaseServer.from('printing_subcategories').insert(validSubs);
        }
      }
    }

    revalidatePath('/admin/printing-categories');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update printing category.' };
  }
}

/**
 * Delete a printing category and its subcategories cascade.
 */
export async function deletePrintingCategory(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseServer
      .from('printing_categories')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/printing-categories');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete printing category.' };
  }
}
