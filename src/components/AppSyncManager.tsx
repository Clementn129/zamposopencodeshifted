import { useEffect } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { useSalesSync } from "@/hooks/useSalesSync";
import { useStockSync } from "@/hooks/useStockSync";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePendingOpsSync } from "@/hooks/usePendingOpsSync";
import { supabase } from "@/integrations/supabase/client";

export const AppSyncManager = () => {
  const { user, isLoading } = useAuthContext();
  const { business, refetch: refetchBusiness } = useBusiness(!isLoading ? user?.id : undefined);

  useSalesSync(business?.id);
  useStockSync(business?.id);
  useRealtimeSync(business?.id);
  usePendingOpsSync(business?.id);

  // Single realtime subscription for business row changes — owned here so
  // multiple useBusiness consumers don't fight over the same channel topic.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`business-${user.id}`)
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
          if (next?.user_id !== user.id) return;
          const interesting = ['subscription_status', 'subscription_expires_at', 'is_locked', 'name', 'logo_url', 'phone', 'email', 'address'];
          const changed = interesting.some((k) => next?.[k] !== prev?.[k]);
          if (changed) {
            void refetchBusiness();
            window.dispatchEvent(new CustomEvent('zampos:business-changed'));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, refetchBusiness]);

  return null;
};
