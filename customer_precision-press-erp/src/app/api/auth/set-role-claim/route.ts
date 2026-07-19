import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/auth/set-role-claim
 * Sets the Firebase custom claim 'role' for the authenticated user.
 * This is called when a user logs in but their token has no role claim yet.
 *
 * IMPORTANT: After this endpoint responds, the client MUST call
 * `firebaseUser.getIdToken(true)` to force-refresh the token so the new
 * custom claim is included. Any server actions that rely on `decoded.role`
 * will read the stale claim until the token is refreshed.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken, role } = await req.json();

    if (!idToken || !role) {
      return NextResponse.json({ error: 'idToken and role are required.' }, { status: 400 });
    }

    // 1. Verify the token to get the user's UID
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // 2. Set the custom claim on the user's Firebase Auth record
    await adminAuth.setCustomUserClaims(uid, { role });

    // 3. Signal the client to force-refresh the token to bake in the new claim.
    //    Without a forced refresh, all subsequent server actions will read
    //    the OLD token from cookies and see decoded.role as undefined.
    return NextResponse.json({ success: true, uid, role, requiresTokenRefresh: true });
  } catch (error: any) {
    console.error('[set-role-claim] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to set role claim.' }, { status: 500 });
  }
}
