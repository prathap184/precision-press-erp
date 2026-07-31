import { supabase } from '@/lib/supabase';

export interface BankAccountItem {
  id?: string;
  created_at?: string;
  label: string;
  accountNumber?: string;
  ifsc?: string;
  description?: string;
  payeeName?: string;
  upiId?: string;
  paymentType?: 'BANK_TRANSFER' | 'QR_PAY' | 'UPI_PAY';
  qrUrl?: string;
  opening_balance?: string | number;
}

export async function getBankAccounts(): Promise<BankAccountItem[]> {
  try {
    const { data, error } = await supabase
      .from('bankAccounts')
      .select('*');

    if (error) {
      console.error('Error fetching bank accounts:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to get bank accounts:', err);
    return [];
  }
}

export async function saveBankAccount(account: BankAccountItem): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const id = account.id || `BA-${Math.floor(100000 + Math.random() * 900000)}`;
    const payload = {
      id,
      label: account.label,
      accountNumber: account.accountNumber || '',
      ifsc: account.ifsc || '',
      description: account.description || '',
      payeeName: account.payeeName || '',
      upiId: account.upiId || '',
      paymentType: account.paymentType || 'BANK_TRANSFER',
      qrUrl: account.qrUrl || '',
      opening_balance: (account.opening_balance !== undefined && account.opening_balance !== null) 
        ? account.opening_balance.toString() 
        : '0.00',
    };

    const { data, error } = await supabase
      .from('bankAccounts')
      .upsert([payload])
      .select();

    if (error) {
      console.error('Error saving bank account:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data: data?.[0] };
  } catch (err: any) {
    console.error('Save bank account error:', err);
    return { success: false, error: err?.message || 'Failed to save bank account' };
  }
}

export async function deleteBankAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('bankAccounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting bank account:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Delete bank account error:', err);
    return { success: false, error: err?.message || 'Failed to delete bank account' };
  }
}
