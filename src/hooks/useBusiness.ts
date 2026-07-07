import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  cacheSubscription,
  getCachedSubscription,
  cacheServerTime,
  getAdjustedTime,
  isOfflineTooLong,
  cacheBusiness,
  getCachedBusiness,
} from '@/lib/offlineStorage';
import { useOnlineStatus } from './useOnlineStatus';
import type { Database } from '@/integrations/supabase/types';

type BusinessRow = Database['public']['Tables']['businesses']['Row'];

interface Business {
  id: string;
  name: string;
  paymentCode: string;
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'locked';
  subscriptionExpiresAt: Date | null;
  isLocked: boolean;
  lastSyncAt: Date;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  tpin?: string | null;
  taxMode: 'none' | 'vat' | 'custom';
  vatNumber?: string | null;
  vatRate: number;
  customTaxName?: string | null;
  customTaxRate?: number | null;
  planTier?: string | null;
}


const mapBusinessRow = (row: BusinessRow): Business => ({
  id: row.id,
  name: row.name,
  paymentCode: row.payment_code,
  subscriptionStatus: row.subscription_status as Business['subscriptionStatus'],
  subscriptionExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at) : null,
  isLocked: row.is_locked,
  lastSyncAt: new Date(row.last_sync_at ?? new Date().toISOString()),
  phone: row.phone,
  email: row.email,
  address: row.address,
  logoUrl: row.logo_url,
  tpin: row.tpin,
  taxMode: (row.tax_mode ?? 'none') as Business['taxMode'],
  vatNumber: row.vat_number,
  vatRate: Number(row.vat_rate ?? 16),
  customTaxName: row.custom_tax_name,
  customTaxRate: row.custom_tax_rate != null ? Number(row.custom_tax_rate) : null,
  planTier: (row as any).plan_tier ?? null,

});

export const useBusiness = (userId: string | undefined) => {
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useOnlineStatus();

  const persistBusinessCache = useCallback(async (row: BusinessRow) => {
    cacheSubscription({
      expiresAt: row.subscription_expires_at || '',
      status: row.subscription_status,
      lastSyncAt: new Date().toISOString(),
      isLocked: row.is_locked,
    });

    await cacheBusiness({
      id: row.id,
      name: row.name,
      paymentCode: row.payment_code,
      subscriptionStatus: row.subscription_status,
      subscriptionExpiresAt: row.subscription_expires_at,
      isLocked: row.is_locked,
      lastSyncAt: row.last_sync_at ?? new Date().toISOString(),
      phone: row.phone,
      email: row.email,
      address: row.address,
    });
  }, []);

  const loadCachedBusiness = useCallback(async () => {
    const cachedBiz = await getCachedBusiness();
    if (cachedBiz) {
      const now = getAdjustedTime();
      const expiry = cachedBiz.subscriptionExpiresAt ? new Date(cachedBiz.subscriptionExpiresAt) : null;
      const isExpiredOffline = expiry ? now >= expiry : true;

      setBusiness({
        id: cachedBiz.id,
        name: cachedBiz.name,
        paymentCode: cachedBiz.paymentCode,
        subscriptionStatus: isExpiredOffline ? 'expired' : (cachedBiz.subscriptionStatus as Business['subscriptionStatus']),
        subscriptionExpiresAt: expiry,
        isLocked: isExpiredOffline || cachedBiz.isLocked,
        lastSyncAt: new Date(cachedBiz.lastSyncAt),
        phone: cachedBiz.phone,
        email: cachedBiz.email,
        address: cachedBiz.address,
        taxMode: 'none',
        vatRate: 16,
      });
      return;
    }

    const cached = getCachedSubscription();
    if (!cached) return;

    const now = getAdjustedTime();
    const expiry = cached.expiresAt ? new Date(cached.expiresAt) : null;
    const isExpiredOffline = expiry ? now >= expiry : true;

    setBusiness({
      id: '',
      name: 'Offline Mode',
      paymentCode: '',
      subscriptionStatus: isExpiredOffline ? 'expired' : (cached.status as Business['subscriptionStatus']),
      subscriptionExpiresAt: expiry,
      isLocked: isExpiredOffline || cached.isLocked,
      lastSyncAt: new Date(cached.lastSyncAt),
      taxMode: 'none',
      vatRate: 16,
    });
  }, []);

  const updateSubscriptionStatusInDB = useCallback(async (businessId: string, currentStatus: string, expiresAt: string | null) => {
    if (!isOnline) return false;
    const now = new Date();
    const isDue = !expiresAt || now.getTime() >= new Date(expiresAt).getTime();
    if (!isDue || currentStatus === 'expired' || currentStatus === 'locked') return false;
    const { data, error } = await supabase.rpc('expire_business_if_due', { _business_id: businessId });
    if (error) {
      console.warn('expire_business_if_due failed:', error);
      return false;
    }
    return !!data;
  }, [isOnline]);

  const fetchBusiness = useCallback(async () => {
    if (!userId) {
      setBusiness(null);
      setIsLoading(false);
      return;
    }

    // Only show the "Loading…" state on first load. Background refetches
    // (realtime updates, tab focus, network flap) must not flip isLoading
    // true or every consumer page unmounts its dialogs / children.
    setBusiness((prev) => {
      if (!prev) setIsLoading(true);
      return prev;
    });
    setError(null);


    try {
      if (!isOnline) {
        await loadCachedBusiness();
        return;
      }

      // Resolve business id for either an owner or an active cashier
      const { data: bizId, error: idErr } = await supabase.rpc('get_my_business_id');
      if (idErr) throw idErr;
      if (!bizId) {
        setBusiness(null);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', bizId as string)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!data) {
        setBusiness(null);
        return;
      }

      cacheServerTime(new Date());

      const wasUpdated = await updateSubscriptionStatusInDB(
        data.id,
        data.subscription_status,
        data.subscription_expires_at
      );

      const row = wasUpdated
        ? (await supabase.from('businesses').select('*').eq('id', data.id).maybeSingle()).data ?? data
        : data;

      setBusiness(mapBusinessRow(row));
      await persistBusinessCache(row);

      // Note: do NOT update last_sync_at here — it triggers the realtime
      // subscription below and causes an infinite refetch loop.
    } catch (err: unknown) {
      console.error('Error fetching business:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load business data';
      setError(msg);
      await loadCachedBusiness();
    } finally {
      setIsLoading(false);
    }
  }, [userId, isOnline, loadCachedBusiness, persistBusinessCache, updateSubscriptionStatusInDB]);

  useEffect(() => {
    fetchBusiness();
  }, [fetchBusiness]);

  useEffect(() => {
    if (!isOnline || !userId) return;

    const channel = supabase
      .channel(`business-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'businesses',
        },
        (payload) => {
          const next = payload.new as Record<string, any> | null;
          const prev = payload.old as Record<string, any> | null;
          if (next?.user_id !== userId) return;
          // Only refetch when subscription/lock fields actually changed —
          // ignore noise like last_sync_at or updated_at to avoid loops.
          const interesting = ['subscription_status', 'subscription_expires_at', 'is_locked', 'name', 'logo_url', 'phone', 'email', 'address'];
          const changed = interesting.some((k) => next?.[k] !== prev?.[k]);
          if (changed) void fetchBusiness();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchBusiness, isOnline, userId]);

  const checkSubscriptionStatus = useCallback((): { isExpired: boolean; isLocked: boolean; daysRemaining: number } => {
    if (!business) {
      return { isExpired: false, isLocked: false, daysRemaining: 0 };
    }

    if (isOfflineTooLong(35)) {
      return { isExpired: true, isLocked: true, daysRemaining: 0 };
    }

    const now = getAdjustedTime();
    const expiresAt = business.subscriptionExpiresAt;

    if (!expiresAt) {
      return { isExpired: true, isLocked: true, daysRemaining: 0 };
    }

    const isExpired = now >= expiresAt;
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      isExpired,
      isLocked: business.isLocked || isExpired,
      daysRemaining,
    };
  }, [business]);

  return {
    business,
    isLoading,
    error,
    refetch: fetchBusiness,
    checkSubscriptionStatus,
  };
};
