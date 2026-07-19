// @ts-nocheck
'use server';

import { adminAuth, adminDb } from '../firebase-admin';
import { UserProfile, DeliveryAddress } from '@/types/auth';
import { logActivity } from '../logger';
import { updateStatsIncrementally } from '../stats';
import { cookies } from 'next/headers';
import { serializeFirestoreData } from '../firestore-serializer';
import { getAuthorizedUser } from '../workflow';

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

    // 1. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.tempPassword || 'ChangeMe123!',
      displayName: data.businessName || data.name,
    });

    const customerUid = userRecord.uid || (userRecord as any).id;

    if (!customerUid) {
      throw new Error('Failed to derive customer UID from auth record');
    }

    // 2. Set Custom Claims
    await adminAuth.setCustomUserClaims(customerUid, { role: 'CUSTOMER' });

    // 3. Create Profile and Update Stats in Transaction
    await adminDb.runTransaction(async (transaction) => {
      // READS FIRST
      // Update Global Metrics
      await updateStatsIncrementally(transaction, {
        'financial.totalCreditExposure': data.creditLimit,
        'financial.totalOutstanding': data.initialBalance || 0
      });

      // WRITES SECOND
      const profileRef = adminDb.collection('profiles').doc(userRecord.uid);
      
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

      const profile: UserProfile = {
        uid: userRecord.uid,
        email: data.email,
        name: data.name,
        displayName: data.businessName || data.name,
        role: 'CUSTOMER',
        customerType: data.customerType,
        creditLimit: data.creditLimit,
        usedCredit: data.initialBalance || 0,
        status: 'ACTIVE',
        businessName: data.businessName,
        phone: data.phone,
        state: data.state,
        country: data.country,
        pincode: data.pincode,
        gstType: data.gstType,
        gstNumber: data.gstNumber,
        gstVerified: data.gstVerified,
        gstDetails: data.gstDetails,
        voucherType: data.voucherType,
        addresses,
        defaultAddressId,
        createdAt: new Date().toISOString(),
        billing_address_line1: data.houseNumber || '',
        billing_address_line2: data.roadName || data.address || '',
        billing_city: data.city || '',
        billing_state: data.state || '',
        billing_pincode: data.pincode || '',
        billing_country: data.country || 'India',
      };

      transaction.set(profileRef, profile);
    });

    // 4. Initial Balance Transaction (if any)
    if (data.initialBalance && data.initialBalance > 0) {
      await adminDb.collection('transactions').add({
        userId: userRecord.uid,
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
      meta: { customerEmail: data.email, customerUid: userRecord.uid }
    });

    return { 
      success: true, 
      uid: userRecord.uid, 
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
    const snap = await adminDb.collection('profiles')
      .where('role', '==', 'CUSTOMER')
      .get();
    
    return snap.docs.map(doc => ({
      id: doc.id,
      ...serializeFirestoreData(doc.data()),
    } as UserProfile));
  } catch (error: any) {
    return [];
  }
}


export async function updateCustomerStatus(uid: string, status: 'ACTIVE' | 'BLOCKED') {
  try {
    await adminDb.collection('profiles').doc(uid).update({ status });
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

    const updates = {
      name,
      displayName,
      role,
      customerType,
      creditLimit,
      usedCredit,
      status,
      businessName,
      phone,
      gstType,
      gstNumber,
      gstVerified,
      voucherType,
      houseNumber,
      roadName,
      city,
      state,
      country,
      pincode,
      address,
      addresses,
      defaultAddressId,
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
      shipping_country
    } as Record<string, any>;

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });

    await adminDb.collection('profiles').doc(uid).update(updates);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function adjustCustomerCredit(uid: string, amount: number, type: 'DEBIT' | 'CREDIT', remarks: string) {
  try {
    const { uid: adminId, role: adminRole } = await getAuthUser();
    
    const profileRef = adminDb.collection('profiles').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    const profile = profileSnap.data() as UserProfile;
    
    const newUsedCredit = type === 'DEBIT' 
      ? (profile.usedCredit || 0) + amount 
      : (profile.usedCredit || 0) - amount;

    await adminDb.runTransaction(async (transaction) => {
      // READS FIRST
      // Update Global Metrics
      await updateStatsIncrementally(transaction, {
        'financial.totalOutstanding': type === 'DEBIT' ? amount : -amount
      });

      // WRITES SECOND
      transaction.update(profileRef, { usedCredit: newUsedCredit });
      
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
    const profileRef = adminDb.collection('profiles').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    
    const profile = profileSnap.data() as UserProfile;
    const addresses = profile.addresses || [];
    
    const newAddress: DeliveryAddress = {
      ...address,
      id: Date.now().toString(),
    };
    
    const isFirstAddress = addresses.length === 0;
    if (isFirstAddress || newAddress.isDefault) {
      addresses.forEach(a => a.isDefault = false);
      newAddress.isDefault = true;
    }
    
    addresses.push(newAddress);
    
    const updates: Partial<UserProfile> = {
      addresses,
    };
    
    if (!profile.billing_address_line1 && !profile.shipping_address_line1) {
       updates.billing_address_line1 = newAddress.houseNumber || '';
       updates.billing_address_line2 = newAddress.roadName || '';
       updates.billing_area = (newAddress as any).area || '';
       updates.billing_city = newAddress.city || '';
       updates.billing_district = (newAddress as any).district || '';
       updates.billing_state = newAddress.state || '';
       updates.billing_state_code = (newAddress as any).stateCode || '';
       updates.billing_pincode = newAddress.pincode || '';
       updates.billing_country = 'India';
    } else if (profile.billing_address_line1 && !profile.shipping_address_line1) {
       updates.shipping_address_line1 = newAddress.houseNumber || '';
       updates.shipping_address_line2 = newAddress.roadName || '';
       updates.shipping_area = (newAddress as any).area || '';
       updates.shipping_city = newAddress.city || '';
       updates.shipping_district = (newAddress as any).district || '';
       updates.shipping_state = newAddress.state || '';
       updates.shipping_state_code = (newAddress as any).stateCode || '';
       updates.shipping_pincode = newAddress.pincode || '';
       updates.shipping_country = 'India';
    }
    
    if (newAddress.isDefault) {
      updates.defaultAddressId = newAddress.id;
    }
    
    await profileRef.update(updates);
    
    return { success: true, address: newAddress };
  } catch (error: any) {
    console.error('addCustomerAddress error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteCustomerAddress(uid: string, addressId: string) {
  try {
    const profileRef = adminDb.collection('profiles').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    
    const profile = profileSnap.data() as UserProfile;
    const addresses = profile.addresses || [];
    
    const filtered = addresses.filter(a => a.id !== addressId);
    
    const updates: Partial<UserProfile> = {
      addresses: filtered,
    };
    
    if (profile.defaultAddressId === addressId) {
      updates.defaultAddressId = filtered.length > 0 ? filtered[0].id : '';
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
    
    const profileRef = adminDb.collection('profiles').doc(uid);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists) throw new Error('Customer not found');
    
    const profile = profileSnap.data() as UserProfile;
    const oldLimit = profile.creditLimit || 0;
    
    await profileRef.update({
      creditLimit: newLimit,
      customerType: newLimit > 0 ? 'CREDIT' : profile.customerType
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

