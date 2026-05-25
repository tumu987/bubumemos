import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import MobileNavBar from "@/components/MobileNavBar";
import PreviewNavButton from "@/components/PreviewNavButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import useMediaQuery from "@/hooks/useMediaQuery";
import type { PreviewMediaItem } from "@/utils/media-item";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PreviewMediaItem[];
  initialIndex?: number;
}

function PdfPreviewDialog({ open, onOpenChange, items, initialIndex = 0 }: Props) {
  const sm = useMediaQuery("sm");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const pdfItems = useMemo(() => items.filter((item) => item.kind === "pdf"), [items]);
  const itemCount = pdfItems.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, itemCount - 1));
  const currentItem = pdfItems[safeIndex];
  const hasMultiple = itemCount > 1;
  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < itemCount - 1;

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, open]);

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

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const handlePrevious = useCallback(() => setCurrentIndex((prev) => Math.max(prev - 1, 0)), []);
  const handleNext = useCallback(() => setCurrentIndex((prev) => Math.min(prev + 1, itemCount - 1)), [itemCount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
        aria-describedby="pdf-preview-description"
      >
        <VisuallyHidden>
          <DialogTitle>{currentItem.filename || "PDF preview"}</DialogTitle>
        </VisuallyHidden>

        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{currentItem.filename || "PDF"}</div>
              {hasMultiple && (
                <div className="mt-1 text-xs text-white/70">
                  {safeIndex + 1} / {itemCount}
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={handleClose}
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full bg-white/10 text-white hover:bg-white/16 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <iframe
          key={currentItem.id}
          src={currentItem.kind === "pdf" ? currentItem.sourceUrl : ""}
          title={currentItem.filename}
          className="h-full w-full border-0 pt-12"
        />

        {hasMultiple && sm && (
          <>
            <PreviewNavButton
              side="left"
              disabled={!canGoPrevious}
              label="Previous item"
              onClick={handlePrevious}
              icon={<ChevronLeft className="h-5 w-5" />}
            />
            <PreviewNavButton
              side="right"
              disabled={!canGoNext}
              label="Next item"
              onClick={handleNext}
              icon={<ChevronRight className="h-5 w-5" />}
            />
          </>
        )}

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

        <div id="pdf-preview-description" className="sr-only">
          PDF preview dialog. Press Escape to close and use left or right arrow keys to switch items.
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PdfPreviewDialog;
