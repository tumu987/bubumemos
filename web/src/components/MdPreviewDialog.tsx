import { ChevronLeft, ChevronRight, Loader, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAccessToken } from "@/auth-state";
import MemoContent from "@/components/MemoContent";
import MobileNavBar from "@/components/MobileNavBar";
import PreviewNavButton from "@/components/PreviewNavButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import useMediaQuery from "@/hooks/useMediaQuery";
import type { MdPreviewMediaItem } from "@/utils/media-item";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MdPreviewMediaItem[];
  initialIndex?: number;
}

const MdPreviewDialog = ({ open, onOpenChange, items, initialIndex = 0 }: Props) => {
  const sm = useMediaQuery("sm");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, open]);

  const itemCount = items.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, itemCount - 1));
  const currentItem = items[safeIndex];
  const hasMultiple = itemCount > 1;
  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < itemCount - 1;

  // Fetch Markdown content when currentItem changes
  useEffect(() => {
    if (!currentItem) return;
    let cancelled = false;

    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const response = await fetch(currentItem.sourceUrl, { headers });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const text = await response.text();
        if (!cancelled) {
          setContent(text);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [currentItem]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "ArrowRight") {
        setCurrentIndex((prev) => Math.min(prev + 1, itemCount - 1));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [itemCount, onOpenChange, open]);

  if (!itemCount || !currentItem) {
    return null;
  }

  const handleClose = () => onOpenChange(false);
  const handlePrevious = () => setCurrentIndex((prev) => Math.max(prev - 1, 0));
  const handleNext = () => setCurrentIndex((prev) => Math.min(prev + 1, itemCount - 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-background p-0 shadow-none"
        aria-describedby="md-preview-description"
      >
        <VisuallyHidden>
          <DialogTitle>{currentItem.filename || "Markdown preview"}</DialogTitle>
        </VisuallyHidden>

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-background/95 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{currentItem.filename || "Markdown"}</div>
              {hasMultiple && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {safeIndex + 1} / {itemCount}
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={handleClose}
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full bg-muted text-foreground hover:bg-muted/80"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div
          className="flex h-full w-full items-start justify-center px-3 pb-20 pt-16 sm:px-16 sm:pb-8 sm:pt-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <div className="w-full max-w-3xl overflow-y-auto py-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
            {!loading && !error && content && <MemoContent content={content} />}
          </div>
        </div>

        {/* Desktop nav buttons */}
        {hasMultiple && sm && (
          <>
            <PreviewNavButton
              side="left"
              disabled={!canGoPrevious}
              label="Previous Markdown"
              onClick={handlePrevious}
              icon={<ChevronLeft className="h-5 w-5" />}
            />
            <PreviewNavButton
              side="right"
              disabled={!canGoNext}
              label="Next Markdown"
              onClick={handleNext}
              icon={<ChevronRight className="h-5 w-5" />}
            />
          </>
        )}

        {/* Mobile nav bar */}
        {hasMultiple && !sm && (
          <MobileNavBar
            current={safeIndex + 1}
            total={itemCount}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />
        )}

        <div id="md-preview-description" className="sr-only">
          Markdown preview dialog. Press Escape to close and use left or right arrow keys to switch between files.
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MdPreviewDialog;
