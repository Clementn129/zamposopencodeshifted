import { useState, useEffect, useCallback, useRef } from 'react';
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

const isElectronBiz = typeof navigator !== 'undefined' && navigator.userAgent?.includes('Electron');
const BUSINESS_LOADING_TIMEOUT_MS = isElectronBiz ? 5_000 : 20_000;

export const useBusiness = (userId: string | undefined) => {
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useOnlineStatus();
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety timeout: force isLoading false after 20s to prevent stuck loading
  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const startLoadingTimer = useCallback(() => {
    clearLoadingTimer();
    loadingTimerRef.current = setTimeout(() => {
      loadingTimerRef.current = null;
      console.warn('[useBusiness] Loading timed out after 20s — forcing ready state');
      setIsLoading(false);
    }, BUSINESS_LOADING_TIMEOUT_MS);
  }, [clearLoadingTimer]);

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
      taxMode: (row.tax_mode ?? 'none') as Business['taxMode'],
      vatRate: Number(row.vat_rate ?? 16),
      customTaxName: row.custom_tax_name,
      customTaxRate: row.custom_tax_rate != null ? Number(row.custom_tax_rate) : null,
      tpin: row.tpin,
      logoUrl: row.logo_url,
      vatNumber: row.vat_number,
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
        taxMode: (cachedBiz.taxMode ?? 'none') as Business['taxMode'],
        vatRate: cachedBiz.vatRate ?? 16,
        customTaxName: cachedBiz.customTaxName ?? null,
        customTaxRate: cachedBiz.customTaxRate ?? null,
        tpin: cachedBiz.tpin ?? null,
        logoUrl: cachedBiz.logoUrl ?? null,
        vatNumber: cachedBiz.vatNumber ?? null,
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
      if (!prev) {
        setIsLoading(true);
        startLoadingTimer();
      }
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

      // Stamp last_sync_at and capture server time for anti-tamper
      const { data: touched } = await supabase
        .from('businesses')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', data.id)
        .select('updated_at')
        .single()
        .catch(() => ({ data: null }));
      const serverTime = touched?.updated_at
        ? new Date(touched.updated_at + 'Z')
        : new Date(data.updated_at ?? new Date().toISOString());
      cacheServerTime(serverTime);
    } catch (err: unknown) {
      console.error('Error fetching business:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load business data';
      setError(msg);
      await loadCachedBusiness();
    } finally {
      clearLoadingTimer();
      setIsLoading(false);
    }
  }, [userId, isOnline, loadCachedBusiness, persistBusinessCache, updateSubscriptionStatusInDB, startLoadingTimer, clearLoadingTimer]);

  useEffect(() => {
    fetchBusiness();
    return () => clearLoadingTimer();
  }, [fetchBusiness, clearLoadingTimer]);

  // Realtime business changes are handled centrally in AppSyncManager via
  // window event — avoids multiple hook instances creating the same channel.
  useEffect(() => {
    if (!isOnline) return;
    const handler = () => void fetchBusiness();
    window.addEventListener('zampos:business-changed', handler);
    return () => window.removeEventListener('zampos:business-changed', handler);
  }, [fetchBusiness, isOnline]);

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
