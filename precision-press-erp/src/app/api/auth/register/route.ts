import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

type RegisterBody = {
  email?: string;
  password?: string;
  role?: string;
  name?: string;
  printerCategory?: string;
  printerSubCategory?: string;
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

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k && v) {
      cookies[k] = decodeURIComponent(v);
    }
  }
  return cookies;
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
    
    // Default to CUSTOMER for public signups unless caller is verified Admin
    let role = 'CUSTOMER';
    let callerIsAdmin = false;
    
    // 1. Check cookies for Admin role
    const cookieMap = parseCookies(request.headers.get('cookie'));
    const roleCookie = (cookieMap['role'] || '').toUpperCase();
    const rolesCookie = cookieMap['roles'] || '';
    if (roleCookie === 'ADMIN' || roleCookie === 'SUPER_ADMIN') {
      callerIsAdmin = true;
    } else if (rolesCookie) {
      try {
        const parsed = JSON.parse(rolesCookie);
        if (Array.isArray(parsed) && (parsed.includes('ADMIN') || parsed.includes('SUPER_ADMIN'))) {
          callerIsAdmin = true;
        }
      } catch {}
    }

    // 2. Check Authorization Bearer token (Supabase access token)
    const authHeader = request.headers.get('Authorization');
    if (!callerIsAdmin && authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        const { data: authData } = await supabaseServer.auth.getUser(token);
        if (authData?.user) {
          const { data: callerProfile } = await supabaseServer
            .from('profiles')
            .select('role, roles')
            .eq('id', authData.user.id)
            .maybeSingle();

          const cr = [callerProfile?.role, ...(Array.isArray(callerProfile?.roles) ? callerProfile.roles : [])]
            .map(r => String(r).toUpperCase());
          if (cr.includes('ADMIN') || cr.includes('SUPER_ADMIN') || cr.includes('OWNER')) {
            callerIsAdmin = true;
          }
        }
      } catch (e) {
        // Fall through
      }
    }

    if (callerIsAdmin) {
      role = requestedRole;
    }

    const name = body.name?.trim() || 'User';
    let printerCategory = role === 'PRINTER' ? (body.printerCategory?.trim() || undefined) : undefined;
    let printerSubCategory = role === 'PRINTER' ? (body.printerSubCategory?.trim() || undefined) : undefined;
    let printingCategoryId: string | null = null;
    let printingSubcategoryId: string | null = null;

    if (role === 'PRINTER' && printerCategory && printerCategory !== 'MAIN_PRINTER') {
      const { data: catRecord } = await supabaseServer
        .from('printing_categories')
        .select('id, name')
        .or(`id.eq.${printerCategory},name.ilike.${printerCategory}`)
        .maybeSingle();

      if (catRecord) {
        printingCategoryId = catRecord.id;
        printerCategory = catRecord.name;

        if (printerSubCategory) {
          const { data: subRecord } = await supabaseServer
            .from('printing_subcategories')
            .select('id, name')
            .eq('category_id', catRecord.id)
            .or(`id.eq.${printerSubCategory},name.ilike.${printerSubCategory}`)
            .maybeSingle();

          if (subRecord) {
            printingSubcategoryId = subRecord.id;
            printerSubCategory = subRecord.name;
          }
        }
      }
    }

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

    const profilePayload: Record<string, any> = {
      id: authUser!.id,
      uid: authUser!.id,
      email,
      name,
      displayName: name,
      role,
      roles: [role],
      customerType,
      creditLimit: (isCustomer && customerType === 'CREDIT') ? (body.creditLimit || 0) : 0,
      usedCredit: existingProfile?.usedCredit ?? 0,
      status: 'ACTIVE',
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(role === 'PRINTER' ? {
        printerCategory: printerCategory || 'MAIN_PRINTER',
        printing_category_name: printerCategory || 'MAIN_PRINTER',
        printing_category_id: printingCategoryId,
        printing_subcategory_name: printerSubCategory || null,
        printing_subcategory_id: printingSubcategoryId,
      } : {}),
      ...(isCustomer ? {
        businessName: body.businessName?.trim() || body.companyName?.trim() || name,
        phone: body.phone?.trim() || null,
        state: body.state?.trim() || null,
        country: body.country?.trim() || 'India',
        pincode: body.pincode?.trim() || null,
        gstType: body.gstType || 'Unregistered',
        gst_registered: body.gstType !== 'Unregistered',
        gstNumber: body.gstType !== 'Unregistered' ? body.gstNumber?.trim() : null,
        gstVerified: body.gstType !== 'Unregistered' ? body.gstVerified || false : false,
        voucherType: body.voucherType || 'Type 0',
        billing_address_line1: body.billingAddressLine1?.trim() || body.houseNumber?.trim() || null,
        billing_address_line2: body.billingAddressLine2?.trim() || body.roadName?.trim() || body.address?.trim() || null,
        billing_city: body.city?.trim() || null,
        billing_state: body.state?.trim() || null,
        billing_pincode: body.pincode?.trim() || null,
        billing_country: body.country?.trim() || 'India',
        shipping_same_as_billing: true,
        shipping_country: body.country?.trim() || 'India',
        addresses: (body.houseNumber || body.roadName || body.pincode || body.address) ? [{
          id: Date.now().toString(),
          houseNumber: body.houseNumber?.trim() || '',
          roadName: body.roadName?.trim() || body.address?.trim() || '',
          city: body.city?.trim() || '',
          state: body.state?.trim() || '',
          pincode: body.pincode?.trim() || '',
          isDefault: true
        }] : [],
        defaultAddressId: (body.houseNumber || body.roadName || body.pincode || body.address) ? Date.now().toString() : null,
      } : {}),
    };

    const { error: profileError } = await supabaseServer.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (profileError) {
      console.error('[auth/register] profiles upsert error:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ user: authUser, profile: profilePayload });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to register user.' }, { status: 500 });
  }
}
