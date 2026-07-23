import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

type LoginBody = {
  email?: string;
  password?: string;
};

async function findProfileByEmail(email: string) {
  const { data, error } = await (supabaseServer.from('profiles') as any)
    .select('id, email, role, status')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return (data as any) ?? null;
}

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseServer.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit('auth_login', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = (await request.json()) as LoginBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password.' }, { status: 400 });
    }

    // ── SECURITY: Only allow login for pre-approved profiles ──────────────────
    // If no profile exists in our system, reject immediately.
    // This prevents anyone from creating an account just by attempting to log in.
    const existingProfile = await findProfileByEmail(email);
    if (!existingProfile) {
      // Return same generic error as a wrong password to avoid email enumeration
      return NextResponse.json(
        { error: 'Invalid login credentials.' },
        { status: 401 },
      );
    }

    // ── SECURITY: Block inactive/suspended accounts ───────────────────────────
    if (existingProfile.status && existingProfile.status === 'INACTIVE') {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact admin.' },
        { status: 403 },
      );
    }

    // Profile exists — sync the auth user (create or update password)
    const existingAuthUser = await findAuthUserByEmail(email);

    if (existingAuthUser) {
      // User exists in auth — just update the password
      const { error } = await supabaseServer.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      // Auth record missing (profile exists but no auth user) — create auth user only
      const { error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to complete login.' },
      { status: 500 },
    );
  }
}
