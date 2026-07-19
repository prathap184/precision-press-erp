'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { getAuthorizedUser } from '@/lib/workflow';
import { revalidatePath } from 'next/cache';

export interface NoteItemInput {
  productId: string;
  quantityReturned: number;
  rate: number;
  total: number;
}

export interface CreditNotePayload {
  invoiceId?: string;
  userId: string;
  items: NoteItemInput[];
  reason: string;
  settlementType: 'CUSTOMER_CREDIT' | 'REFUND_NOW';
  paymentMode?: string;
  totalAmount: number;
  gstAmount: number;
}

export interface DebitNotePayload {
  invoiceId?: string;
  supplierId: string;
  items: NoteItemInput[];
  reason: string;
  settlementType: 'SUPPLIER_CREDIT' | 'RECEIVE_REFUND_NOW';
  paymentMode?: string;
  totalAmount: number;
  gstAmount: number;
}

export async function createCreditNote(payload: CreditNotePayload) {
  try {
    const adminUser = await getAuthorizedUser(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPER_ADMIN']);
    
    // Generate Note Number
    const timestamp = Date.now().toString().slice(-6);
    const noteNumber = `CN-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${timestamp}`;

    // Insert Credit Note
    const { data: note, error: noteError } = await supabaseServer
      .from('credit_notes')
      .insert({
        note_number: noteNumber,
        invoice_id: payload.invoiceId || null,
        user_id: payload.userId,
        total_amount: payload.totalAmount,
        gst_amount: payload.gstAmount,
        reason: payload.reason,
        settlement_type: payload.settlementType,
        payment_mode: payload.paymentMode || null,
        status: 'ISSUED'
      })
      .select('id')
      .single();

    if (noteError || !note) {
      throw new Error(`Failed to create credit note: ${noteError?.message}`);
    }

    // Insert Items and Update Inventory
    for (const item of payload.items) {
      if (item.productId && item.quantityReturned > 0) {
        await supabaseServer.from('credit_note_items').insert({
          note_id: note.id,
          product_id: item.productId,
          quantity_returned: item.quantityReturned,
          rate: item.rate,
          total: item.total
        });

        // Update Inventory (INWARD)
        const { data: prodData } = await supabaseServer
          .from('products')
          .select('current_stock')
          .eq('id', item.productId)
          .single();
          
        const currentStock = Number(prodData?.current_stock || 0);
        const newStock = currentStock + item.quantityReturned;
        
        await supabaseServer.from('products')
          .update({ current_stock: newStock })
          .eq('id', item.productId);
          
        await supabaseServer.from('product_track')
          .insert({
            product_id: item.productId,
            movement_type: 'INWARD',
            quantity: item.quantityReturned,
            reference_id: note.id,
            remarks: `Credit Note ${noteNumber}`,
            created_by: adminUser.id
          });
      }
    }

    // If settlement is CUSTOMER_CREDIT, we need to add a transaction
    if (payload.settlementType === 'CUSTOMER_CREDIT') {
      const { data: lastTx } = await supabaseServer
        .from('transactions')
        .select('balanceAfter')
        .eq('userId', payload.userId)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      // Ensure proper numeric parsing for calculation
      const balanceBefore = lastTx?.balanceAfter ? Number(lastTx.balanceAfter) : 0;
      
      // Calculate new balance
      // Since it's a customer credit note, the customer's balance increases (we owe them more or they owe us less)
      // Usually, positive balance means customer owes us. So a credit reduces their debt.
      // But let's check how transactions are calculated in the system (debit increases balance? credit decreases?).
      // Assuming debit = customer owes more, credit = customer owes less.
      // So balanceAfter = balanceBefore - payload.totalAmount
      const creditAmount = payload.totalAmount;
      const balanceAfter = balanceBefore - creditAmount;

      await supabaseServer.from('transactions').insert({
        id: `TXN-CN-${timestamp}`,
        userId: payload.userId,
        type: 'CREDIT_NOTE',
        refId: note.id,
        credit: creditAmount,
        debit: 0,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        remarks: `Credit Note Issued: ${noteNumber}`,
        createdBy: adminUser.id,
        timestamp: new Date().toISOString(),
        isVerified: true,
        verifiedBy: adminUser.id,
        paymentMode: payload.paymentMode
      });
    }

    revalidatePath('/admin/returns');
    return { success: true, noteId: note.id, noteNumber };
  } catch (error: any) {
    console.error('Create Credit Note Error:', error);
    return { success: false, error: error.message };
  }
}

export async function createDebitNote(payload: DebitNotePayload) {
  try {
    const adminUser = await getAuthorizedUser(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPER_ADMIN']);
    
    // Generate Note Number
    const timestamp = Date.now().toString().slice(-6);
    const noteNumber = `DN-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${timestamp}`;

    // Insert Debit Note
    const { data: note, error: noteError } = await supabaseServer
      .from('debit_notes')
      .insert({
        note_number: noteNumber,
        invoice_id: payload.invoiceId || null,
        supplier_id: payload.supplierId,
        total_amount: payload.totalAmount,
        gst_amount: payload.gstAmount,
        reason: payload.reason,
        settlement_type: payload.settlementType,
        payment_mode: payload.paymentMode || null,
        status: 'ISSUED'
      })
      .select('id')
      .single();

    if (noteError || !note) {
      throw new Error(`Failed to create debit note: ${noteError?.message}`);
    }

    // Insert Items and Update Inventory
    for (const item of payload.items) {
      if (item.productId && item.quantityReturned > 0) {
        await supabaseServer.from('debit_note_items').insert({
          note_id: note.id,
          product_id: item.productId,
          quantity_returned: item.quantityReturned,
          rate: item.rate,
          total: item.total
        });

        // Update Inventory (OUTWARD for supplier return)
        const { data: prodData } = await supabaseServer
          .from('products')
          .select('current_stock')
          .eq('id', item.productId)
          .single();
          
        const currentStock = Number(prodData?.current_stock || 0);
        const newStock = currentStock - item.quantityReturned;
        
        await supabaseServer.from('products')
          .update({ current_stock: newStock })
          .eq('id', item.productId);
          
        await supabaseServer.from('product_track')
          .insert({
            product_id: item.productId,
            movement_type: 'OUTWARD',
            quantity: item.quantityReturned,
            reference_id: note.id,
            remarks: `Debit Note ${noteNumber}`,
            created_by: adminUser.id
          });
      }
    }

    // Ledger for suppliers isn't well defined yet, we'll leave it as is or can add later.

    revalidatePath('/admin/returns');
    return { success: true, noteId: note.id, noteNumber };
  } catch (error: any) {
    console.error('Create Debit Note Error:', error);
    return { success: false, error: error.message };
  }
}
