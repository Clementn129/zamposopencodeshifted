import { useAuthContext } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { useSalesSync } from "@/hooks/useSalesSync";
import { useStockSync } from "@/hooks/useStockSync";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePendingOpsSync } from "@/hooks/usePendingOpsSync";

export const AppSyncManager = () => {
  const { user, isLoading } = useAuthContext();
  const { business } = useBusiness(!isLoading ? user?.id : undefined);

  useSalesSync(business?.id);
  useStockSync(business?.id);
  useRealtimeSync(business?.id);
  usePendingOpsSync(business?.id);

  return null;
};
