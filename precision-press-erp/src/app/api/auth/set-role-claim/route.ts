import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/auth/set-role-claim
 * Sets the Firebase custom claim 'role' for the authenticated user.
 * This is called when a user logs in but their token has no role claim yet.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required.' }, { status: 400 });
    }

    // 1. Verify the token to get the user's UID
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // 2. Securely fetch the user's true role from the database (bypassing RLS)
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .single();

    if (error || !profile?.role) {
      console.error('[set-role-claim] Role fetch failed for', uid, error);
      return NextResponse.json({ error: 'Could not resolve user role. Contact administrator.' }, { status: 403 });
    }

    const trueRole = profile.role;

    // 3. Set the custom claim on the user's Firebase Auth record
    await adminAuth.setCustomUserClaims(uid, { role: trueRole });

    // 4. Signal the client to force-refresh the token
    return NextResponse.json({ success: true, uid, role: trueRole, requiresTokenRefresh: true });
  } catch (error: any) {
    console.error('[set-role-claim] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to set role claim.' }, { status: 500 });
  }
}
