// @ts-nocheck
import { supabaseServer } from './supabase-server';

export interface DecodedIdToken {
  uid: string;
  email?: string | null;
  role?: string;
  roles?: string[];
  name?: string;
  [key: string]: any;
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
  if (error || !data.user) {
    console.error('Supabase token verification error:', error?.message ?? 'Unknown error');
    throw new Error('Unauthorized');
  }

  const profileQuery = supabaseServer.from('profiles').select('*');

  const { data: profileById, error: profileByIdError } = await profileQuery
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileByIdError) {
    console.error('Supabase profile lookup error:', profileByIdError.message);
  }

  let profile = profileById;

  if (!profile && data.user.email) {
    const { data: profileByEmail, error: profileByEmailError } = await profileQuery
      .eq('email', data.user.email)
      .maybeSingle();

    if (profileByEmailError) {
      console.error('Supabase profile email lookup error:', profileByEmailError.message);
    }

    profile = profileByEmail;
  }

  const metadata = (data.user.user_metadata as any) || {};
  const profileRoles = Array.isArray(profile?.roles) ? profile.roles : [];
  const metadataRoles = Array.isArray(metadata.roles) ? metadata.roles : [];
  const roles = profileRoles.length > 0 ? profileRoles : metadataRoles;
  const role =
    profile?.role ||
    (roles.length > 0 ? roles[0] : undefined) ||
    metadata.role ||
    'CUSTOMER';

  return {
    uid: data.user.id,
    email: data.user.email,
    name:
      metadata.name ||
      metadata.full_name ||
      data.user.email?.split('@')[0] ||
      'Unknown',
    role,
    roles,
    profile,
    ...data.user,
  };
}
