import { CloudOff, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfflineBannerProps {
  isOnline: boolean;
  message?: string;
}

const OfflineBanner = ({ isOnline, message }: OfflineBannerProps) => {
  if (isOnline) {
    return null;
  }

  return (
    <div
      className={cn(
        "px-4 py-2 text-sm flex items-center justify-center gap-2",
        "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
      )}
    >
      <CloudOff className="h-4 w-4" />
      <span>{message || "Offline mode - Using cached data"}</span>
    </div>
  );
};

export default OfflineBanner;