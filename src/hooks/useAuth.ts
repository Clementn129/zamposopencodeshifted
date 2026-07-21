import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const isElectron = typeof navigator !== 'undefined' && navigator.userAgent?.includes('Electron');
const LOADING_TIMEOUT_MS = isElectron ? 3_000 : 15_000;

export type UserRole = 'owner' | 'cashier' | 'super_admin' | 'unknown';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  role: UserRole;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isSuperAdmin: false,
    role: 'unknown',
  });

  const initialCheckDone = useRef(false);
  const authEventHandled = useRef(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveRole = useCallback(async (_userId: string) => {
    // Retry a couple of times to survive transient "Failed to fetch" during
    // PWA boot / cold network wake-up. Backoff is intentionally short so the
    // UI doesn't get stuck on the loading screen.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await supabase.rpc('get_my_role');
        if (!error) {
          const role = (data as UserRole) || 'unknown';
          return { role, isSuperAdmin: role === 'super_admin' };
        }
        // Only retry on network-ish errors; log others once and bail.
        const msg = String(error?.message || '');
        if (!/fetch|network|timeout/i.test(msg)) {
          console.warn('get_my_role failed:', error);
          return { role: 'unknown' as UserRole, isSuperAdmin: false };
        }
      } catch (e) {
        if (attempt === 2) console.warn('resolveRole error:', e);
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return { role: 'unknown' as UserRole, isSuperAdmin: false };
  }, []);

  const applySession = useCallback((session: Session | null, isLoading = false) => {
    setAuthState(prev => ({
      ...prev,
      session,
      user: session?.user ?? null,
      isLoading,
      isSuperAdmin: session?.user ? prev.isSuperAdmin : false,
      role: session?.user ? prev.role : 'unknown',
    }));
  }, []);

  useEffect(() => {
    // Safety timeout: if auth hasn't resolved within 15s, force ready state
    loadingTimerRef.current = setTimeout(() => {
      if (authState.isLoading) {
        console.warn('[useAuth] Auth loading timed out after 15s — forcing ready state');
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
      loadingTimerRef.current = null;
    }, LOADING_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!initialCheckDone.current && event === 'INITIAL_SESSION') return;

        authEventHandled.current = true;
        clearTimeout(loadingTimerRef.current!);
        loadingTimerRef.current = null;

        // If session is null but this isn't an explicit sign-out, re-fetch to
        // guard against transient token-refresh failures (network hiccup etc.)
        if (!session && event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') {
          supabase.auth.getSession().then(({ data: { session: fresh } }) => {
            if (fresh) {
              applySession(fresh);
              setTimeout(async () => {
                const { role, isSuperAdmin } = await resolveRole(fresh.user.id);
                setAuthState(prev => ({ ...prev, role, isSuperAdmin }));
              }, 0);
            } else {
              applySession(null);
              setAuthState(prev => ({ ...prev, isSuperAdmin: false, role: 'unknown' }));
            }
          }).catch(() => {
            // Network completely down — keep existing state rather than logging out
          });
          return;
        }

        applySession(session);

        if (session?.user) {
          setTimeout(async () => {
            const { role, isSuperAdmin } = await resolveRole(session.user.id);
            setAuthState(prev => ({ ...prev, role, isSuperAdmin }));
          }, 0);
        } else {
          setAuthState(prev => ({ ...prev, isSuperAdmin: false, role: 'unknown' }));
        }
      }
    );

    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        initialCheckDone.current = true;
        clearTimeout(loadingTimerRef.current!);
        loadingTimerRef.current = null;
        if (authEventHandled.current) return;
        if (error) console.warn('getSession returned an error:', error);

        applySession(session);

        if (session?.user) {
          try {
            const { role, isSuperAdmin } = await resolveRole(session.user.id);
            setAuthState(prev => ({ ...prev, role, isSuperAdmin }));
          } catch (e) {
            console.warn('Role check failed (likely offline):', e);
          }
        }
      })
      .catch((err: unknown) => {
        console.warn('getSession failed, keeping existing state:', err);
        initialCheckDone.current = true;
        clearTimeout(loadingTimerRef.current!);
        loadingTimerRef.current = null;
        setAuthState(prev => ({ ...prev, isLoading: false }));
      });

    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
      subscription.unsubscribe();
    };
  }, [applySession, resolveRole]);

  const signUp = async (email: string, password: string, fullName: string, businessName: string, phone?: string, address?: string, affiliateCode?: string) => {
    const { getAppUrl } = await import('@/lib/appUrl');
    const redirectUrl = `${getAppUrl()}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          business_name: businessName,
          phone: phone || null,
          address: address || null,
          affiliate_code: affiliateCode || null,
        },
      },
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      applySession(data.session);
      if (data.session?.user) {
        setTimeout(async () => {
          const { role, isSuperAdmin } = await resolveRole(data.session.user.id);
          setAuthState(prev => ({ ...prev, role, isSuperAdmin }));
          try {
            const { cacheOfflineCredentials, hashPassword } = await import('@/lib/offlineStorage');
            const passwordHash = await hashPassword(password);
            await cacheOfflineCredentials({
              email,
              passwordHash,
              userId: data.session.user.id,
              role,
              lastOnlineLogin: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('Failed to cache credentials for offline use:', e);
          }
        }, 0);
      }
    }
    return { error };
  };

  const signInOffline = async (email: string, password: string): Promise<{ error: Error | null }> => {
    try {
      const { verifyOfflineCredentials } = await import('@/lib/offlineStorage');
      const cached = await verifyOfflineCredentials(email, password);
      if (!cached) {
        return { error: new Error('Invalid email or password') };
      }
      const mockUser = {
        id: cached.userId,
        email: cached.email,
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: cached.lastOnlineLogin,
      } as User;
      const mockSession = {
        access_token: 'offline-session-' + cached.userId,
        refresh_token: 'offline-refresh-' + cached.userId,
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        token_type: 'bearer',
        user: mockUser,
      } as Session;
      setAuthState({
        user: mockUser,
        session: mockSession,
        isLoading: false,
        isSuperAdmin: cached.role === 'super_admin',
        role: cached.role as UserRole,
      });
      return { error: null };
    } catch (e) {
      return { error: new Error('Offline login failed') };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error };
    }
    return { error: null };
  };

  return {
    ...authState,
    signUp,
    signIn,
    signInOffline,
    signOut,
  };
};
