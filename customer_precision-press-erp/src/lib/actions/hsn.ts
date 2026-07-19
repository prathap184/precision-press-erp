// @ts-nocheck
'use server';

import { HSNService } from '@/services/hsnService';
import { revalidatePath } from 'next/cache';

export async function getActiveHSNsAction() {
  return await HSNService.getActiveHSNs();
}

export async function createHSNAction(formData: FormData) {
  try {
    const hsnCode = formData.get('hsnCode') as string;
    const description = formData.get('description') as string;
    const gstRate = parseFloat(formData.get('gstRate') as string);
    const effectiveFrom = formData.get('effectiveFrom') as string;
    // Hardcoding system user for now, or you can extract from auth context if available
    const userId = 'ADMIN_USER'; 

    if (!hsnCode || !description || isNaN(gstRate) || !effectiveFrom) {
      return { success: false, error: 'All fields are required and must be valid.' };
    }

    await HSNService.createHSN(hsnCode, description, gstRate, effectiveFrom, userId);
    revalidatePath('/admin/hsn-master');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create HSN code.' };
  }
}

export async function updateHSNDescriptionAction(hsnId: string, description: string) {
  try {
    await HSNService.updateHSNDescription(hsnId, description, 'ADMIN_USER', 'Manual update');
    revalidatePath('/admin/hsn-master');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function toggleHSNStatusAction(hsnId: string, hsnCode: string, isActive: boolean) {
  try {
    if (isActive) {
      await HSNService.disableHSN(hsnId, hsnCode, 'ADMIN_USER', 'Manual toggle');
    } else {
      await HSNService.enableHSN(hsnId, 'ADMIN_USER', 'Manual toggle');
    }
    revalidatePath('/admin/hsn-master');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function addNewGSTRateAction(hsnId: string, gstRate: number, effectiveFrom: string) {
  try {
    await HSNService.addNewGSTRate(hsnId, gstRate, effectiveFrom, 'ADMIN_USER', 'Manual addition');
    revalidatePath('/admin/hsn-master');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
