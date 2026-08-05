'use server';

import { adminAuth, adminDb } from '../firebase-admin';
import { UserProfile, DeliveryAddress } from '@/types/auth';
import { logActivity } from '../logger';
import { updateStatsIncrementally } from '../stats';
import { cookies } from 'next/headers';
import { serializeFirestoreData } from '../firestore-serializer';
import { getAuthorizedUser } from '../workflow';
import { supabaseServer } from '../supabase-server';

async function getAuthUser() {
  const user = await getAuthorizedUser(['ADMIN', 'ACDEMA', 'MANAGER', 'SUPPORT']);
  return { uid: user.id, role: user.role as string };
}

export async function createCustomer(data: {
  email: string;
  name: string;
  businessName?: string;
  phone?: string;
  address?: string; // Legacy
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  houseNumber?: string;
  roadName?: string;
  gstType?: 'Regular' | 'Composition' | 'Unregistered';
  gstNumber?: string;
  gstVerified?: boolean;
  gstDetails?: any;
  customerType: 'CASH' | 'CREDIT';
  creditLimit: number;
  voucherType?: 'Type 0' | 'Type 1';
  initialBalance?: number;
  tempPassword?: string;
}) {
  try {
    const { uid: adminUid } = await getAuthUser();

    let customerUid = '';

    // 1. Create user in Firebase Auth or fetch existing if email exists
    try {
      const userRecord = await adminAuth.createUser({
        email: data.email,
        password: data.tempPassword || 'ChangeMe123!',
        displayName: data.businessName || data.name,
      });
      customerUid = userRecord.uid || (userRecord as any).id;
    } catch (authError: any) {
      if (authError.code === 'email_exists' || authError.message?.includes('already been registered')) {
        const { data: existingId, error: rpcError } = await supabaseServer.rpc('get_user_id_by_email', { p_email: data.email });
        if (existingId) {
          customerUid = existingId;
        } else {
          throw new Error('Email exists in auth but could not fetch the user ID.');
        }
      } else {
        throw authError;
      }
    }

    if (!customerUid) {
      throw new Error('Failed to derive customer UID from auth record');
    }

    // 2. Set Custom Claims
    await adminAuth.setCustomUserClaims(customerUid, { role: 'CUSTOMER' });

    // 3. Create Profile and Update Stats in Transaction
    await adminDb.runTransaction(async (transaction: any) => {
      // READS FIRST
      // Update Global Metrics
      await updateStatsIncrementally(transaction, {
        'financial.totalCreditExposure': data.creditLimit,
        'financial.totalOutstanding': data.initialBalance || 0
      });

      // WRITES SECOND
      const profileRef = adminDb.collection('contact').doc(customerUid);
      
      const addresses: DeliveryAddress[] = [];
      let defaultAddressId: string | undefined = undefined;
      
      if (data.houseNumber || data.roadName || data.pincode || data.address) {
        const addrId = Date.now().toString();
        addresses.push({
          id: addrId,
          houseNumber: data.houseNumber || '',
          roadName: data.roadName || data.address || '',
          city: data.city || '',
          state: data.state || '',
          pincode: data.pincode || '',
          isDefault: true
        });
        defaultAddressId = addrId;
      }

      const profile: any = {
        id: customerUid,
        organization_id: '00000000-0000-0000-0000-000000000002',
        email: data.email,
        name: data.name,
        business_name: data.businessName || data.name,
        type: 'customer',
        customer_type: data.customerType,
        credit_limit: data.customerType === 'CASH' ? 0 : (data.creditLimit || 0),
        used_credit: data.customerType === 'CASH' ? 0 : (data.initialBalance || 0),
        status: 'ACTIVE',
        phone: data.phone,
        billing_state: data.state,
        billing_country: data.country,
        billing_pincode: data.pincode,
        gst_type: data.gstType,
        gst_number: data.gstNumber,
        gst_verified: data.gstVerified,
        gst_details: data.gstDetails,
        voucher_type: data.voucherType,
        addresses,
        created_at: new Date().toISOString(),
        billing_address_line1: data.houseNumber || '',
        billing_address_line2: data.roadName || data.address || '',
        billing_city: data.city || '',
        
      };

      transaction.set(profileRef, profile);
    });

    // 4. Initial Balance Transaction (if any)
    if (data.initialBalance && data.initialBalance > 0) {
      await adminDb.collection('transactions').add({
        userId: customerUid,
        type: 'OPENING',
        debit: data.initialBalance,
        credit: 0,
        balanceAfter: data.initialBalance,
        remarks: 'Opening balance setup by Admin',
        timestamp: new Date().toISOString(),
        createdBy: 'ADMIN_SYSTEM'
      });
    }

    await logActivity({
      userId: 'SYSTEM_ADMIN',
      role: 'ADMIN',
      action: 'CUSTOMER_CREATED',
      meta: { customerEmail: data.email, customerUid }
    });

    return { 
      success: true, 
      uid: customerUid, 
      password: data.tempPassword || 'ChangeMe123!' 
    };
  } catch (error: any) {
    console.error('Error creating customer:', error);
    let message = "Vault entry failed";
    if (error.code === 'auth/email-already-exists') {
      message = "This identity already exists in the secure ledger.";
    } else if (error.code === 'auth/invalid-email') {
      message = "Invalid identifier format.";
    } else if (error.code === 'auth/weak-password') {
      message = "The temporary key is too weak.";
    }
    return { success: false, error: message };
  }
}

export async function getCustomers() {
  try {
    const snap = await adminDb.collection('contact').get();
    
    return snap.docs
      .map((doc: any) => {
        const data = serializeFirestoreData(doc.data());
        const customerData = {
          id: doc.id,
          name: data.name || 'Unknown',
          displayName: data.name || 'Unknown',
          businessName: data.business_name || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || '',
          role: 'CUSTOMER',
          ...data,
          customerType: data.customer_type || (data.payment_terms_days && data.payment_terms_days > 0 ? 'CREDIT' : 'CASH'),
          creditLimit: Number(data.credit_limit ?? 0),
        };
        customerData.uid = data.uid || doc.id;
        return customerData as UserProfile;
      })
      .filter((c: any) => c.type === 'customer' || c.type === 'both' || !c.type);
  } catch (error: any) {
    console.error('getCustomers error:', error);
    return [];
  }
}


export async function updateCustomerStatus(uid: string, status: 'ACTIVE' | 'BLOCKED') {
  try {
    await adminDb.collection('contact').doc(uid).update({ status });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCustomerProfile(uid: string, data: Partial<UserProfile>) {
  try {
    // Keep profile mutations aligned with the Supabase schema.
    const { 
      uid: _, role, customerType, creditLimit, usedCredit, status, name, displayName,
      businessName, phone, gstType, gstNumber, gstVerified, voucherType,
      houseNumber, roadName, city, state, country, pincode,
      address, addresses, defaultAddressId,
      billing_address_line1, billing_address_line2, billing_area, billing_city, billing_district, billing_state, billing_state_code, billing_pincode, billing_country,
      shipping_same_as_billing, shipping_address_line1, shipping_address_line2, shipping_area, shipping_city, shipping_district, shipping_state, shipping_state_code, shipping_pincode, shipping_country
    } = data as any;

    const updates: any = {
      name,
      business_name: businessName,
      type: role === 'CUSTOMER' ? 'customer' : (role === 'SUPPLIER' ? 'supplier' : 'both'),
      customer_type: customerType,
      credit_limit: creditLimit,
      used_credit: usedCredit,
      status,
      phone,
      gst_type: gstType,
      gst_number: gstNumber,
      gst_verified: gstVerified,
      voucher_type: voucherType,
      addresses,
      billing_address_line1,
      billing_address_line2,
      billing_area,
      billing_city,
      billing_district,
      billing_state,
      billing_state_code,
      billing_pincode,
      billing_country,
      shipping_same_as_billing,
      shipping_address_line1,
      shipping_address_line2,
      shipping_area,
      shipping_city,
      shipping_district,
      shipping_state,
      shipping_state_code,
      shipping_pincode,
      shipping_country,
      
    };

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });

    await adminDb.collection('contact').doc(uid).update(updates);

    try {
      const { enqueueTallySync, getTallySettings } = await import('@/lib/actions/tally-sync');
      const settings = await getTallySettings();
      const profileSnap = await adminDb.collection('contact').doc(uid).get();
      const profile = profileSnap.data();
      if (profile) {
        await enqueueTallySync({
          syncType: 'CREATE_CUSTOMER',
          customerId: uid,
          payload: {
            tallyCompanyName: settings.companyName,
            ledgerName: profile.business_name || profile.name || profile.displayName || 'Customer',
            parentGroup: 'Sundry Debtors',
            state: profile.billing_state || profile.state || 'Karnataka',
            country: profile.billing_country || profile.country || 'India',
            address: profile.billing_address_line1 || profile.address || '',
            gstin: profile.gst_number || profile.gstNumber || '',
            pinCode: profile.billing_pincode || profile.pincode || '',
            mobile: profile.phone || '',
          },
          createdBy: 'system',
        });
      }
    } catch (err) {
      console.error('[updateCustomerProfile] Failed to enqueue Tally sync:', err);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function adjustCustomerCredit(uid: string, amount: number, type: 'DEBIT' | 'CREDIT', remarks: string) {
  try {
    const { uid: adminId, role: adminRole } = await getAuthUser();
    
    const profileRef = adminDb.collection('contact').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    const profile = profileSnap.data() as UserProfile;
    
    const usedCredit = (profile as any).used_credit || profile.usedCredit || 0;
    const newUsedCredit = type === 'DEBIT' ? usedCredit + amount : usedCredit - amount;

    await adminDb.runTransaction(async (transaction) => {
      // READS FIRST
      // Update Global Metrics
      await updateStatsIncrementally(transaction, {
        'financial.totalOutstanding': type === 'DEBIT' ? amount : -amount
      });

      // WRITES SECOND
      transaction.update(profileRef, { used_credit: newUsedCredit });
      
      const transactionRef = adminDb.collection('transactions').doc();
      transaction.set(transactionRef, {
        userId: uid,
        type: 'ADJUSTMENT',
        debit: type === 'DEBIT' ? amount : 0,
        credit: type === 'CREDIT' ? amount : 0,
        balanceAfter: newUsedCredit,
        remarks: remarks || `Credit adjustment by admin`,
        timestamp: new Date().toISOString(),
        createdBy: adminId
      });
    });

    // ── Audit Log ─────────────────────────────────────────────────────────────
    if (['ADMIN', 'SUPER_ADMIN'].includes(adminRole)) {
      const { writeAuditLog } = await import('@/lib/audit-log');
      await writeAuditLog({
        actedAs: uid,
        actedAsType: 'CUSTOMER',
        actionType: 'ADJUST_CREDIT',
        entityType: 'TRANSACTION',
        entityId: uid, // Scoped to user profile
        meta: { amount, type, remarks }
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('adjustCustomerCredit error:', error);
    return { success: false, error: error.message };
  }
}

export async function addCustomerAddress(uid: string, address: Omit<DeliveryAddress, 'id'>) {
  try {
    // Use direct Supabase query by primary key (id) to avoid Firestore-adapter
    // quirks where rows with uid=NULL return exists:false despite being present.
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseDirect = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: existingRows, error: fetchError } = await supabaseDirect
      .from('contact')
      .select('*')
      .eq('id', uid)
      .limit(1);

    if (fetchError) throw fetchError;

    let profile: any = existingRows?.[0] || null;

    if (!profile) {
      // Customer row is missing — auto-create a minimal stub so the address
      // is never silently lost. Requires organization_id; use a placeholder UUID.
      const fallbackOrgId = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000000';
      const { data: created, error: createError } = await supabaseDirect
        .from('contact')
        .insert({
          id: uid,
          uid,
          organization_id: fallbackOrgId,
          name: 'Customer',
          type: 'customer',
          billing_country: 'India',
          shipping_country: 'India',
          shipping_same_as_billing: true,
          gst_registered: false,
        })
        .select()
        .single();
      if (createError) throw new Error(`Customer not found and auto-create failed: ${createError.message}`);
      profile = created;
    }

    const newAddress: DeliveryAddress = {
      ...address,
      id: Date.now().toString(),
    };

    const currentAddresses: DeliveryAddress[] = Array.isArray(profile.addresses) ? profile.addresses : [];
    const isFirstAddress = currentAddresses.length === 0;
    if (isFirstAddress || newAddress.isDefault) {
      currentAddresses.forEach(a => (a.isDefault = false));
      newAddress.isDefault = true;
    }
    currentAddresses.push(newAddress);

    const updates: any = { addresses: currentAddresses };

    if (!profile.billing_address_line1 && !profile.shipping_address_line1) {
      updates.billing_address_line1 = newAddress.houseNumber || '';
      updates.billing_address_line2 = newAddress.roadName || '';
      updates.billing_area   = (newAddress as any).area || '';
      updates.billing_city   = newAddress.city || '';
      updates.billing_district = (newAddress as any).district || '';
      updates.billing_state  = newAddress.state || '';
      updates.billing_state_code = (newAddress as any).stateCode || '';
      updates.billing_pincode = newAddress.pincode || '';
      updates.billing_country = 'India';
    } else if (profile.billing_address_line1 && !profile.shipping_address_line1) {
      updates.shipping_address_line1 = newAddress.houseNumber || '';
      updates.shipping_address_line2 = newAddress.roadName || '';
      updates.shipping_area   = (newAddress as any).area || '';
      updates.shipping_city   = newAddress.city || '';
      updates.shipping_district = (newAddress as any).district || '';
      updates.shipping_state  = newAddress.state || '';
      updates.shipping_state_code = (newAddress as any).stateCode || '';
      updates.shipping_pincode = newAddress.pincode || '';
      updates.shipping_country = 'India';
    }

    const { error: updateError } = await supabaseDirect
      .from('contact')
      .update(updates)
      .eq('id', uid);

    if (updateError) throw updateError;

    return { success: true, address: newAddress };
  } catch (error: any) {
    console.error('addCustomerAddress error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteCustomerAddress(uid: string, addressId: string) {
  try {
    const profileRef = adminDb.collection('contact').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    
    const profile = profileSnap.data() as UserProfile;
    const addresses = profile.addresses || [];
    
    const filtered = addresses.filter(a => a.id !== addressId);
    
    const updates: any = {
      addresses: filtered,
    };
    
    if ((profile as any).default_address_id === addressId || profile.defaultAddressId === addressId) {
      
    }
    
    await profileRef.update(updates);
    
    return { success: true };
  } catch (error: any) {
    console.error('deleteCustomerAddress error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateCustomerCreditLimit(uid: string, newLimit: number) {
  try {
    const { uid: adminUid } = await getAuthUser();
    
    const profileRef = adminDb.collection('contact').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    
    const profile = profileSnap.data() as UserProfile;
    const oldLimit = (profile as any).credit_limit || profile.creditLimit || 0;
    
    await profileRef.update({
      credit_limit: newLimit,
      customer_type: newLimit > 0 ? 'CREDIT' : ((profile as any).customer_type || profile.customerType)
    });
    
    await logActivity({
      userId: adminUid,
      role: 'ADMIN',
      action: 'CREDIT_LIMIT_UPDATED',
      meta: { 
        customerUid: uid,
        customerName: profile.displayName || profile.name,
        oldLimit,
        newLimit
      }
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('updateCustomerCreditLimit error:', error);
    return { success: false, error: error.message };
  }
}

export async function getSuppliers() {
  try {
    const snap = await adminDb.collection('contact').get();
    
    return snap.docs
      .map((doc: any) => {
        const data = serializeFirestoreData(doc.data());
        return {
          id: doc.id,
          uid: doc.id,
          name: data.name || 'Unknown',
          displayName: data.name || 'Unknown',
          businessName: data.business_name || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || '',
          role: 'SUPPLIER',
          ...data,
        } as UserProfile;
      })
      .filter((c: any) => c.type === 'supplier' || c.type === 'both');
  } catch (error: any) {
    console.error('getSuppliers error:', error);
    return [];
  }
}
