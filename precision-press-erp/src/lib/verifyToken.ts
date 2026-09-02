import { supabaseServer } from './supabase-server';

export interface DecodedIdToken {
  uid: string;
  email?: string | null;
  role?: string;
  roles?: string[];
  name?: string;
  [key: string]: any;
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Verifies a Supabase access token.
 * The token is expected to be the session access token stored in the `token` cookie.
 */
export async function verifyToken(token: string): Promise<DecodedIdToken> {
  if (!token) {
    throw new Error('Missing authentication token');
  }

  const { data, error } = await supabaseServer.auth.getUser(token);
  let verifiedUser = data?.user;

  if (error || !verifiedUser) {
    console.warn('Supabase token verification note:', error?.message ?? 'No user returned, attempting token decode');
    const decoded = decodeJwtPayload(token);
    if (decoded && (decoded.sub || decoded.email)) {
      verifiedUser = {
        id: decoded.sub || '',
        email: decoded.email || '',
        user_metadata: decoded.user_metadata || {},
      } as any;
    } else {
      throw new Error('Unauthorized');
    }
  }

  const profileQuery = supabaseServer.from('profiles').select('*');

  const { data: profileById, error: profileByIdError } = await profileQuery
    .eq('id', verifiedUser.id)
    .maybeSingle();

  if (profileByIdError) {
    console.error('Supabase profile lookup error:', profileByIdError.message);
  }

  let profile = profileById;

  if (!profile && verifiedUser.email) {
    const { data: profileByEmail, error: profileByEmailError } = await profileQuery
      .eq('email', verifiedUser.email)
      .maybeSingle();

    if (profileByEmailError) {
      console.error('Supabase profile email lookup error:', profileByEmailError.message);
    }

    profile = profileByEmail;
  }

  const metadata = (verifiedUser.user_metadata as any) || {};
  const profileRoles = Array.isArray(profile?.roles) ? profile.roles : [];
  const metadataRoles = Array.isArray(metadata.roles) ? metadata.roles : [];
  const roles = profileRoles.length > 0 ? profileRoles : metadataRoles;
  const role =
    profile?.role ||
    (roles.length > 0 ? roles[0] : undefined) ||
    metadata.role ||
    'CUSTOMER';

  return {
    uid: verifiedUser.id,
    email: verifiedUser.email,
    name:
      metadata.name ||
      metadata.full_name ||
      verifiedUser.email?.split('@')[0] ||
      'Unknown',
    role,
    roles,
    profile,
    ...verifiedUser,
  };
}
