import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

type LoginBody = {
  email?: string;
  password?: string;
};

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseServer.auth.admin.listUsers();
  if (error) {
    throw error;
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit('auth_login', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = (await request.json()) as LoginBody;
    const email = body.email?.trim();
    const password = body.password?.trim();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password.' }, { status: 400 });
    }

    const existingAuthUser = await findAuthUserByEmail(email);
    if (existingAuthUser) {
      const { error } = await supabaseServer.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const profileQuery = supabaseServer.from('profiles').select('*');
    const { data: profileRow, error: profileError } = existingAuthUser
      ? await profileQuery.or(`id.eq.${existingAuthUser.id},email.eq.${email}`).maybeSingle()
      : await profileQuery.eq('email', email).maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    if (!profileRow) {
      const role = (existingAuthUser?.user_metadata as any)?.customClaims?.role
        || (existingAuthUser?.user_metadata as any)?.role
        || 'CUSTOMER';
      const name = (existingAuthUser?.user_metadata as any)?.displayName
        || (existingAuthUser?.user_metadata as any)?.name
        || email.split('@')[0];

      const { error: createProfileError } = await supabaseServer.from('profiles').upsert({
        id: existingAuthUser?.id || email,
        uid: existingAuthUser?.id || email,
        email,
        name,
        displayName: name,
        role,
        customerType: 'CASH',
        creditLimit: 0,
        usedCredit: 0,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (createProfileError) {
        return NextResponse.json({ error: createProfileError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to bootstrap login.' }, { status: 500 });
  }
}
