import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

const ConnectionStatus = () => {
  const { isOnline } = useOnlineStatus();
  const [showBanner, setShowBanner] = useState(false);
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setShowOnlineMessage(false);
    } else if (showBanner) {
      // Show "back online" message briefly
      setShowOnlineMessage(true);
      const timer = setTimeout(() => {
        setShowBanner(false);
        setShowOnlineMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, showBanner]);

  if (!showBanner) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
      showOnlineMessage 
        ? 'bg-success text-success-foreground' 
        : 'bg-warning text-warning-foreground'
    }`}>
      {showOnlineMessage ? (
        <>
          <Wifi className="h-4 w-4" />
          Back Online - Syncing data...
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          Offline Mode - Sales will sync when connected
        </>
      )}
    </div>
  );
};

export default ConnectionStatus;
