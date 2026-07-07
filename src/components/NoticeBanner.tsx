import { useEffect, useState } from "react";
import { X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Notice {
  id: string;
  title: string;
  message: string;
  starts_at: string;
  ends_at: string | null;
  target_business_id: string | null;
}

interface NoticeBannerProps {
  businessId?: string;
}

const NoticeBanner = ({ businessId }: NoticeBannerProps) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        // Build query to get active notices
        const { data, error } = await supabase
          .from("notices")
          .select("id, title, message, starts_at, ends_at, target_business_id")
          .eq("is_active", true)
          .lte("starts_at", new Date().toISOString())
          .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
          .order("created_at", { ascending: false });

        if (!error && data) {
          // Filter notices: show if target_business_id is null (all) or matches current business
          const filteredNotices = (data as Notice[]).filter(n => 
            n.target_business_id === null || n.target_business_id === businessId
          );
          setNotices(filteredNotices);
        }
      } catch (e) {
        console.error("Failed to fetch notices:", e);
      }
    };

    fetchNotices();
  }, [businessId]);

  const dismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  const visibleNotices = notices.filter((n) => !dismissedIds.has(n.id));

  if (visibleNotices.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleNotices.map((notice) => (
        <div
          key={notice.id}
          className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-start gap-3"
        >
          <Bell className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">{notice.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{notice.message}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => dismiss(notice.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
};

export default NoticeBanner;
