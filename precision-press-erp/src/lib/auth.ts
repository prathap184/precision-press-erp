// @ts-nocheck - next-auth v5 beta type compatibility (runtime is correct)
import NextAuth, { CredentialsSignin } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { headers } from "next/headers";
import { trackLogin } from "./auth/track-login";
import { getAppleClientSecret } from "./auth/apple-secret";
import { getSiteSetting } from "./site-settings";
import { sql } from "drizzle-orm";
import { isTwoFactorEnabled, verifyTwoFactor } from "./auth/two-factor";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Optional second factor. Only consulted when the user has 2FA enabled, so
  // password-only login is unaffected for everyone else (2FA is opt-in).
  totp: z.string().optional(),
});

// Thrown from authorize() when a 2FA-enabled user signs in with a correct
// password but no TOTP code. Extends CredentialsSignin so NextAuth surfaces the
// `code` to the client (res.code === "TwoFactorRequired"), letting the sign-in
// page prompt for a code instead of showing a generic error.
const BaseSigninError = (typeof CredentialsSignin !== "undefined" && CredentialsSignin) ? CredentialsSignin : Error;
export class TwoFactorRequiredError extends BaseSigninError {
  code = "TwoFactorRequired";
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  // Generate Apple client secret from .p8 key if configured,
  // otherwise use the default Apple provider (reads AUTH_APPLE_SECRET)
  const appleProvider = process.env.AUTH_APPLE_KEY_BASE64
    ? Apple({
        clientId: process.env.AUTH_APPLE_ID,
        clientSecret: await getAppleClientSecret(),
        allowDangerousEmailAccountLinking: true,
      })
    : Apple({ allowDangerousEmailAccountLinking: true });

  return {
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ allowDangerousEmailAccountLinking: true })]
      : []),
    ...(process.env.AUTH_APPLE_ID && (process.env.AUTH_APPLE_KEY_BASE64 || process.env.AUTH_APPLE_SECRET)
      ? [appleProvider]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "2FA Code", type: "text" },
        // SSO fast-path: passed from precision-press-erp accounting redirect
        ssoToken: { label: "SSO Token", type: "text" },
      },
      async authorize(credentials) {
        // ── SSO fast-path ────────────────────────────────────────────────────
        // When the user clicks "Accounting" in precision-press-erp, their
        // Supabase access_token is forwarded here. We verify it and skip the
        // password check entirely — the Supabase token IS the proof of identity.
        if (credentials?.ssoToken && credentials?.email) {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          const { data: { user: supabaseUser }, error } =
            await supabase.auth.getUser(credentials.ssoToken as string);

          if (error || !supabaseUser?.email) return null;

          // Emails must match — prevents token reuse for a different account
          if (supabaseUser.email.toLowerCase() !== (credentials.email as string).toLowerCase()) {
            return null;
          }

          const user = await db.query.users.findFirst({
            where: sql`lower(${users.email}) = lower(${supabaseUser.email})`,
          });

          if (!user) return null;

          return { id: user.id, name: user.name, email: user.email, image: user.image };
        }

        // ── Normal email + password login ────────────────────────────────────
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        // Opt-in second factor: only enforced when the user has enabled 2FA.
        if (await isTwoFactorEnabled(user.id)) {
          const code = parsed.data.totp?.trim();
          if (!code) throw new TwoFactorRequiredError();
          const ok = await verifyTwoFactor(user.id, code);
          if (!ok) return null;
        }

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Skip checks for credentials (already validated in register route)
      if (account?.provider === "credentials") return true;

      const email = user.email;
      if (!email) return false;

      // Check domain restriction
      const allowedDomains = await getSiteSetting("allowed_email_domains");
      if (allowedDomains) {
        const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
        const emailDomain = email.split("@")[1]?.toLowerCase();
        if (!emailDomain || !domains.includes(emailDomain)) return false;
      }

      // Check if user already exists (existing user = sign in, not registration)
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (existingUser) return true;

      // New OAuth user = registration
      const [{ count: userCount }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users);
      const isFirstUser = userCount === 0;

      if (!isFirstUser) {
        const registrationMode = await getSiteSetting("registration_mode");
        if (registrationMode === "disabled") return false;
        if (registrationMode === "invite_only") return false;
      }

      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      // Track OAuth logins (credentials tracked in route handler)
      if (account?.provider && account.provider !== "credentials" && user.id) {
        const hdrs = await headers();
        const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
          || hdrs.get("x-real-ip")
          || "unknown";
        const ua = hdrs.get("user-agent");
        trackLogin({
          userId: user.id,
          ipAddress: ip,
          userAgent: ua,
          provider: account.provider,
        });
      }
    },
    async createUser({ user }) {
      if (!user.id) return;

      // Check if first user (count <= 1 because this user was just created)
      const [{ count: userCount }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users);
      const isFirstUser = userCount <= 1;

      if (isFirstUser) {
        await db.update(users).set({ isSiteAdmin: true }).where(eq(users.id, user.id));
      }
    },
  },
  };
});
