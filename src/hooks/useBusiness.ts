import { useBusinessContext, Business } from './BusinessContext';

export interface UseBusinessReturn {
  business: Business | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  checkSubscriptionStatus: () => { isExpired: boolean; isLocked: boolean; daysRemaining: number };
}

export const useBusiness = (userId?: string): UseBusinessReturn => {
  const {
    business,
    isLoading,
    error,
    refetch,
    checkSubscriptionStatus,
  } = useBusinessContext();

  void userId;

  return {
    business,
    isLoading,
    error,
    refetch,
    checkSubscriptionStatus,
  };
};
