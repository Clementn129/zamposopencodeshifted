import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  businessId: string;
  /** Current preview URL (signed or full) */
  previewUrl: string | null;
  /** Current storage path stored on the row, e.g. "{businessId}/abc.png" */
  currentPath: string | null;
  /** Called with new storage path + a freshly signed preview URL after upload */
  onUploaded: (path: string, signedUrl: string | null) => void;
  /** Called when the user removes the image */
  onCleared: () => void;
  disabled?: boolean;
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ProductImageUpload = ({
  businessId,
  previewUrl,
  currentPath,
  onUploaded,
  onCleared,
  disabled,
}: Props) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({
        variant: "destructive",
        title: "Image too large",
        description: "Max 2 MB. Try a smaller photo.",
      });
      return;
    }
    if (!/^image\//.test(file.type)) {
      toast({
        variant: "destructive",
        title: "Not an image",
        description: "Upload a PNG or JPEG.",
      });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${businessId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      // Best-effort: delete the previous file
      if (currentPath) {
        await supabase.storage.from("product-images").remove([currentPath]);
      }

      // Long-lived signed URL (~1 year). Workspace blocks public buckets, so this
      // is the longest-lived option without exposing the bucket.
      const { data: signed } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365);


      onUploaded(path, signed?.signedUrl ?? null);
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (currentPath) {
      await supabase.storage.from("product-images").remove([currentPath]).catch(() => {});
    }
    onCleared();
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {previewUrl ? (
          <img src={previewUrl} alt="Product" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="h-3.5 w-3.5 mr-2" /> {previewUrl ? "Replace" : "Add image"}
            </>
          )}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive h-7"
            disabled={disabled || uploading}
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Remove
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>
    </div>
  );
};

export default ProductImageUpload;
