import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusBannerProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncError?: string | null;
}

const SyncStatusBanner = ({ isOnline, isSyncing, pendingCount, lastSyncError }: SyncStatusBannerProps) => {
  if (isOnline && pendingCount === 0 && !lastSyncError) {
    return null; // All synced, no need to show banner
  }

  return (
    <div
      className={cn(
        "px-4 py-2 text-sm flex items-center justify-center gap-2",
        !isOnline && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
        isOnline && isSyncing && "bg-blue-500/20 text-blue-700 dark:text-blue-400",
        isOnline && pendingCount > 0 && !isSyncing && "bg-orange-500/20 text-orange-700 dark:text-orange-400",
        lastSyncError && "bg-destructive/20 text-destructive"
      )}
    >
      {!isOnline && (
        <>
          <CloudOff className="h-4 w-4" />
          <span>Offline mode - Sales saved locally ({pendingCount} pending sync)</span>
        </>
      )}
      
      {isOnline && isSyncing && (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Syncing {pendingCount} sale(s) to cloud...</span>
        </>
      )}
      
      {isOnline && pendingCount > 0 && !isSyncing && !lastSyncError && (
        <>
          <Cloud className="h-4 w-4" />
          <span>{pendingCount} sale(s) waiting to sync</span>
        </>
      )}
      
      {lastSyncError && (
        <>
          <AlertTriangle className="h-4 w-4" />
          <span>Sync error: {lastSyncError} - Data saved locally</span>
        </>
      )}
    </div>
  );
};

export default SyncStatusBanner;
