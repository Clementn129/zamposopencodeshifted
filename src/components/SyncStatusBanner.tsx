import { Cloud, CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusBannerProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  isPulling?: boolean;
  lastSyncError?: string | null;
  failedCount?: number;
  failedDetail?: string | null;
  onRetryFailed?: () => void;
  onClearFailed?: () => void;
  onSyncNow?: () => void;
}

const actionBtn = "ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline";

const SyncStatusBanner = ({
  isOnline,
  isSyncing,
  pendingCount,
  isPulling,
  lastSyncError,
  failedCount = 0,
  failedDetail,
  onRetryFailed,
  onClearFailed,
  onSyncNow,
}: SyncStatusBannerProps) => {
  const allClear = isOnline && pendingCount === 0 && !lastSyncError && !isPulling && failedCount === 0;
  if (allClear) return null;

  if (failedCount > 0) {
    return (
      <div className="px-4 py-2 text-sm flex items-center justify-center gap-2 bg-destructive/20 text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">
          {failedCount} offline change(s) couldn't sync{isOnline ? "" : " (still offline)"}
          {failedDetail ? ` — ${failedDetail}` : ""}
        </span>
        {isOnline && onRetryFailed && (
          <button type="button" onClick={onRetryFailed} className={cn(actionBtn, "text-destructive")}>
            Retry
          </button>
        )}
        {onClearFailed && (
          <button type="button" onClick={onClearFailed} className={cn(actionBtn, "text-destructive")}>
            Discard
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "px-4 py-2 text-sm flex items-center justify-center gap-2",
        !isOnline && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
        isOnline && isSyncing && "bg-blue-500/20 text-blue-700 dark:text-blue-400",
        isOnline && isPulling && "bg-blue-500/20 text-blue-700 dark:text-blue-400",
        isOnline && pendingCount > 0 && !isSyncing && !isPulling && "bg-orange-500/20 text-orange-700 dark:text-orange-400",
        lastSyncError && "bg-destructive/20 text-destructive"
      )}
    >
      {!isOnline && (
        <>
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Offline mode - Sales saved locally ({pendingCount} pending sync)</span>
        </>
      )}

      {isOnline && isPulling && (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Checking for the latest data...</span>
        </>
      )}

      {isOnline && isSyncing && !isPulling && (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Syncing {pendingCount} sale(s) to cloud...</span>
        </>
      )}

      {isOnline && pendingCount > 0 && !isSyncing && !isPulling && !lastSyncError && (
        <>
          <Cloud className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{pendingCount} sale(s) waiting to sync</span>
          {onSyncNow && (
            <button type="button" onClick={onSyncNow} className={cn(actionBtn, "text-orange-700 dark:text-orange-400")}>
              Sync now
            </button>
          )}
        </>
      )}

      {lastSyncError && (
        <>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Sync error: {lastSyncError} - Data saved locally</span>
          {isOnline && onSyncNow && (
            <button type="button" onClick={onSyncNow} className={cn(actionBtn, "text-destructive")}>
              Sync now
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default SyncStatusBanner;