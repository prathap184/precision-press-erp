import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

type RegisterBody = {
  email?: string;
  password?: string;
  role?: string;
  name?: string;
  printerCategory?: string;
  companyName?: string;
  contactPerson?: string;
  alternateMobile?: string;
  panNumber?: string;
  businessName?: string;
  phone?: string;
  address?: string;
  state?: string;
  country?: string;
  pincode?: string;
  houseNumber?: string;
  roadName?: string;
  city?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingArea?: string;
  billingDistrict?: string;
  billingStateCode?: string;
  gstType?: 'Regular' | 'Composition' | 'Unregistered';
  gstNumber?: string;
  gstVerified?: boolean;
  gstDetails?: any;
  customerType?: 'CASH' | 'CREDIT';
  creditLimit?: number;
  voucherType?: 'Type 0' | 'Type 1';
};

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseServer.auth.admin.listUsers();
  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function findProfileByEmail(email: string) {
  const { data, error } = await supabaseServer.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) {
    throw error;
  }
  return data ?? null;
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit('auth_register', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = (await request.json()) as RegisterBody;
    const email = body.email?.trim();
    const password = body.password?.trim();
    const requestedRole = body.role?.trim() || 'CUSTOMER';
    
    // Default to CUSTOMER for public signups
    let role = 'CUSTOMER';
    
    // If an authorization token is provided, check if an Admin is making this request
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        // Need to import adminAuth from '@/lib/firebase-admin' for this to work
        const { adminAuth } = await import('@/lib/firebase-admin');
        const idToken = authHeader.split('Bearer ')[1];
        const decoded = await adminAuth.verifyIdToken(idToken);
        
        // Securely fetch caller's true role from DB
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const { data: caller } = await supabaseAdmin.from('profiles').select('role').eq('id', decoded.uid).single();
        
        if (caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN' || caller?.role === 'OWNER') {
          // Caller is an admin creating an account, allow the requested role
          role = requestedRole;
        }
      } catch (e) {
        // Ignore auth error, just treat as a public signup (forces CUSTOMER role)
      }
    }

    const name = body.name?.trim() || 'User';
    const printerCategory = role === 'PRINTER' ? (body.printerCategory?.trim() || undefined) : undefined;

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password.' }, { status: 400 });
    }

    const existingAuthUser = await findAuthUserByEmail(email);
    let authUser = existingAuthUser;

    if (existingAuthUser) {
      const { data, error } = await supabaseServer.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (error || !data.user) {
        return NextResponse.json({ error: error?.message || 'Unable to update existing auth user.' }, { status: 400 });
      }

      authUser = data.user;
    } else {
      const { data, error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (error || !data.user) {
        return NextResponse.json({ error: error?.message || 'Unable to create auth user.' }, { status: 400 });
      }

      authUser = data.user;
    }

    const existingProfile = await findProfileByEmail(email);
    
    // Customer specific fields
    const isCustomer = role === 'CUSTOMER';
    const customerType = isCustomer ? (body.customerType || 'CASH') : 'CASH';
    const creditStatus = isCustomer && customerType === 'CREDIT' ? 'PENDING_APPROVAL' : 'APPROVED';

    const profilePayload = existingProfile
      ? {
          ...existingProfile,
          role: existingProfile.role ?? role,
          roles: existingProfile.roles ?? [existingProfile.role ?? role],
          uid: existingProfile.uid ?? existingProfile.id,
        }
      : {
          id: authUser!.id,
          uid: authUser!.id,
          email,
          name,
          displayName: name,
          role,
          roles: [role],
          ...(printerCategory ? { printerCategory } : {}),
          ...(isCustomer ? {
            company_name: body.companyName?.trim() || body.businessName?.trim() || name,
            contact_person: body.contactPerson?.trim() || name,
            alternate_mobile: body.alternateMobile?.trim() || '',
            pan_number: body.panNumber?.trim() || '',
            businessName: body.businessName?.trim() || name,
            phone: body.phone?.trim(),
            address: body.address?.trim(),
            houseNumber: body.houseNumber?.trim() || '',
            roadName: body.roadName?.trim() || body.address?.trim() || '',
            city: body.city?.trim() || '',
            state: body.state?.trim(),
            country: body.country?.trim() || 'India',
            pincode: body.pincode?.trim(),
            billing_address_line1: body.billingAddressLine1?.trim() || body.houseNumber?.trim() || '',
            billing_address_line2: body.billingAddressLine2?.trim() || body.roadName?.trim() || body.address?.trim() || '',
            billing_area: body.billingArea?.trim() || '',
            billing_city: body.city?.trim() || '',
            billing_district: body.billingDistrict?.trim() || body.city?.trim() || '',
            billing_state: body.state?.trim() || '',
            billing_state_code: body.billingStateCode?.trim() || '',
            billing_pincode: body.pincode?.trim() || '',
            billing_country: body.country?.trim() || 'India',
            shipping_same_as_billing: true,
            gstType: body.gstType || 'Unregistered',
            gst_registered: body.gstType !== 'Unregistered',
            gstin: body.gstType !== 'Unregistered' ? body.gstNumber?.trim() : undefined,
            gstNumber: body.gstType !== 'Unregistered' ? body.gstNumber?.trim() : undefined,
            gstVerified: body.gstType !== 'Unregistered' ? body.gstVerified || false : false,
            gstDetails: body.gstType !== 'Unregistered' ? body.gstDetails || null : null,
            customerType,
            creditLimit: customerType === 'CREDIT' ? (body.creditLimit || 0) : 0,
            voucherType: body.voucherType || 'Type 0',
            creditStatus,
            addresses: (body.houseNumber || body.roadName || body.pincode || body.address) ? [{
              id: Date.now().toString(),
              houseNumber: body.houseNumber?.trim() || '',
              roadName: body.roadName?.trim() || body.address?.trim() || '',
              city: body.city?.trim() || '',
              state: body.state?.trim() || '',
              pincode: body.pincode?.trim() || '',
              isDefault: true
            }] : [],
            defaultAddressId: (body.houseNumber || body.roadName || body.pincode || body.address) ? Date.now().toString() : undefined,
          } : {
            customerType: 'CASH',
            creditLimit: 0,
            status: 'ACTIVE',
          }),
          usedCredit: 0,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };

    if (!existingProfile) {
      const { error: profileError } = await supabaseServer.from('profiles').upsert(profilePayload, { onConflict: 'id' });
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ user: authUser, profile: profilePayload });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to register user.' }, { status: 500 });
  }
}
