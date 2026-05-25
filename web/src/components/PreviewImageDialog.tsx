import { ChevronLeft, ChevronRight, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MobileNavBar from "@/components/MobileNavBar";
import MotionPhotoPreview from "@/components/MotionPhotoPreview";
import PreviewNavButton from "@/components/PreviewNavButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import useMediaQuery from "@/hooks/useMediaQuery";
import type { PreviewMediaItem } from "@/utils/media-item";

const MAX_SCALE = 5;
const DOUBLE_TAP_FACTOR = 2.5;
const SWIPE_THRESHOLD = 40;
const DOUBLE_TAP_DELAY = 300;

interface ZoomableImageProps {
  src: string;
  alt: string;
  onNavigate?: (direction: -1 | 1) => void;
}

const newGestureState = () => ({
  type: "none" as "none" | "pan" | "pinch",
  startX: 0,
  startY: 0,
  startTransformX: 0,
  startTransformY: 0,
  startPinchDist: 0,
  startPinchScale: 1,
  pinchCenterX: 0,
  pinchCenterY: 0,
  touchStartX: 0,
  touchStartY: 0,
  lastTouchX: 0,
  lastTouchY: 0,
});

const ZoomableImage = ({ src, alt, onNavigate }: ZoomableImageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Layout state: fit = the image sized to fill the container, zoom = additional scale+pan on top.
  const layoutRef = useRef({
    fitX: 0,
    fitY: 0,
    fitW: 0,
    fitH: 0, // fitted position & size
    zoom: 1,
    panX: 0,
    panY: 0, // extra zoom & pan
    cw: 0,
    ch: 0, // container size
    ready: false,
  });

  const lastNavRef = useRef(0);
  const lastTapRef = useRef(0);
  const gestureRef = useRef(newGestureState());

  /** Write layoutRef into the DOM. */
  const applyLayout = useCallback((transition?: string) => {
    const img = imgRef.current;
    if (!img) return;
    const L = layoutRef.current;

    if (!L.ready) {
      // Fit not yet computed — let CSS flex centering + max-width/height handle it.
      img.style.position = "";
      img.style.left = "";
      img.style.top = "";
      img.style.width = "";
      img.style.height = "";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.transform = "";
      img.style.transformOrigin = "";
      img.style.transition = "";
      return;
    }

    img.style.position = "absolute";
    img.style.left = `${L.fitX}px`;
    img.style.top = `${L.fitY}px`;
    img.style.width = `${L.fitW}px`;
    img.style.height = `${L.fitH}px`;
    img.style.maxWidth = "";
    img.style.maxHeight = "";

    if (L.zoom <= 1.001) {
      img.style.transform = "none";
      img.style.transformOrigin = "";
      img.style.transition = transition || "none";
      img.style.willChange = "auto";
    } else {
      img.style.transform = `translate(${L.panX}px, ${L.panY}px) scale(${L.zoom})`;
      img.style.transformOrigin = "0 0";
      img.style.transition = transition || "none";
      img.style.willChange = "transform";
    }
  }, []);

  const computeFit = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw < 50 || ch < 50) return;

    const s = Math.min(cw / nw, ch / nh, 1);
    const w = nw * s;
    const h = nh * s;
    const L = layoutRef.current;
    L.fitX = (cw - w) / 2;
    L.fitY = (ch - h) / 2;
    L.fitW = w;
    L.fitH = h;
    L.cw = cw;
    L.ch = ch;
    L.ready = true;
  }, []);

  const resetToFit = useCallback(
    (transition?: string) => {
      layoutRef.current.zoom = 1;
      layoutRef.current.panX = 0;
      layoutRef.current.panY = 0;
      applyLayout(transition);
    },
    [applyLayout],
  );

  const isAtFit = useCallback(() => layoutRef.current.zoom <= 1.001, []);

  // ---- image load / src change ----

  const handleImageLoad = useCallback(() => {
    computeFit();
    resetToFit();
  }, [computeFit, resetToFit]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth) {
      computeFit();
      resetToFit();
    }
  }, [src, computeFit, resetToFit]);

  // Keep fitted on container resize. Preserve zoom state.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let prevFitW = 0;
    const observer = new ResizeObserver(() => {
      const img = imgRef.current;
      if (!img?.naturalWidth) return;
      const wasAtFit = layoutRef.current.zoom <= 1.001;
      prevFitW = layoutRef.current.fitW;
      computeFit();
      if (wasAtFit || prevFitW === 0) {
        resetToFit();
      } else {
        // Re-clamp pan to new container bounds.
        const L = layoutRef.current;
        const scaledW = L.fitW * L.zoom;
        const scaledH = L.fitH * L.zoom;
        if (scaledW > L.cw) L.panX = Math.max(L.cw - L.fitX - scaledW, Math.min(-L.fitX, L.panX));
        else L.panX = (L.cw - scaledW) / 2 - L.fitX;
        if (scaledH > L.ch) L.panY = Math.max(L.ch - L.fitY - scaledH, Math.min(-L.fitY, L.panY));
        else L.panY = (L.ch - scaledH) / 2 - L.fitY;
        applyLayout();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [computeFit, resetToFit, applyLayout]);

  // ---- clamping ----

  const clampPan = useCallback((panX: number, panY: number, zoom: number) => {
    const L = layoutRef.current;
    if (!L.ready) return { x: 0, y: 0 };
    const scaledW = L.fitW * zoom;
    const scaledH = L.fitH * zoom;
    let cx = panX;
    let cy = panY;
    if (scaledW <= L.cw) cx = (L.cw - scaledW) / 2 - L.fitX;
    else cx = Math.max(L.cw - L.fitX - scaledW, Math.min(-L.fitX, panX));
    if (scaledH <= L.ch) cy = (L.ch - scaledH) / 2 - L.fitY;
    else cy = Math.max(L.ch - L.fitY - scaledH, Math.min(-L.fitY, panY));
    return { x: cx, y: cy };
  }, []);

  // ---- zoom ----

  const setZoom = useCallback(
    (newZoom: number, cx: number, cy: number, transition?: string) => {
      const L = layoutRef.current;
      if (!L.ready) return;
      const z = Math.max(1, Math.min(MAX_SCALE, newZoom));

      if (z <= 1.001) {
        resetToFit(transition);
        return;
      }

      // Keep the container point (cx,cy) fixed on the same image pixel.
      const prevZoom = L.zoom || 1;
      const ix = (cx - L.fitX - L.panX) / prevZoom;
      const iy = (cy - L.fitY - L.panY) / prevZoom;
      const panX = cx - L.fitX - ix * z;
      const panY = cy - L.fitY - iy * z;
      const clamped = clampPan(panX, panY, z);

      L.zoom = z;
      L.panX = clamped.x;
      L.panY = clamped.y;
      applyLayout(transition);
    },
    [applyLayout, clampPan, resetToFit],
  );

  // ---- touch handlers ----

  const getDistance = (touches: React.TouchList, i: number, j: number) =>
    Math.hypot(touches[i].clientX - touches[j].clientX, touches[i].clientY - touches[j].clientY);

  const getMidpoint = (touches: React.TouchList, i: number, j: number) => ({
    x: (touches[i].clientX + touches[j].clientX) / 2,
    y: (touches[i].clientY + touches[j].clientY) / 2,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;
      if (touches.length === 1) {
        const now = Date.now();
        const L = layoutRef.current;
        gestureRef.current = {
          ...newGestureState(),
          type: "pan",
          startX: touches[0].clientX,
          startY: touches[0].clientY,
          startTransformX: L.panX,
          startTransformY: L.panY,
          touchStartX: touches[0].clientX,
          touchStartY: touches[0].clientY,
        };
        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
          e.preventDefault();
          if (L.zoom > 1.001) {
            resetToFit("transform 0.3s ease-out");
          } else {
            setZoom(L.zoom * DOUBLE_TAP_FACTOR, touches[0].clientX, touches[0].clientY, "transform 0.3s ease-out");
          }
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      } else if (touches.length === 2) {
        gestureRef.current = {
          ...newGestureState(),
          type: "pinch",
          startPinchDist: getDistance(touches, 0, 1),
          startPinchScale: layoutRef.current.zoom,
          startTransformX: layoutRef.current.panX,
          startTransformY: layoutRef.current.panY,
          pinchCenterX: getMidpoint(touches, 0, 1).x,
          pinchCenterY: getMidpoint(touches, 0, 1).y,
        };
      }
    },
    [setZoom, resetToFit],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const g = gestureRef.current;
      const touches = e.touches;

      if (touches.length === 1 && g.type === "pan") {
        g.lastTouchX = touches[0].clientX;
        g.lastTouchY = touches[0].clientY;
        if (!isAtFit()) {
          const dx = touches[0].clientX - g.startX;
          const dy = touches[0].clientY - g.startY;
          const clamped = clampPan(g.startTransformX + dx, g.startTransformY + dy, layoutRef.current.zoom);
          const L = layoutRef.current;
          L.panX = clamped.x;
          L.panY = clamped.y;
          applyLayout();
        }
      } else if (touches.length === 2 && g.type === "pinch") {
        e.preventDefault();
        const dist = getDistance(touches, 0, 1);
        const scaleRatio = dist / g.startPinchDist;
        setZoom(g.startPinchScale * scaleRatio, g.pinchCenterX, g.pinchCenterY);
      }
    },
    [applyLayout, clampPan, setZoom, isAtFit],
  );

  const handleTouchEnd = useCallback(() => {
    const g = gestureRef.current;
    if (g.type === "pan" && isAtFit() && onNavigate) {
      const dx = g.lastTouchX - g.touchStartX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        onNavigate(dx > 0 ? -1 : 1);
      }
    }
    gestureRef.current = newGestureState();
  }, [onNavigate, isAtFit]);

  // ---- mouse / trackpad ----

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const L = layoutRef.current;
      if (L.zoom > 1.001) {
        resetToFit("transform 0.3s ease-out");
      } else {
        setZoom(L.zoom * DOUBLE_TAP_FACTOR, e.clientX, e.clientY, "transform 0.3s ease-out");
      }
    },
    [setZoom, resetToFit],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      const absDX = Math.abs(e.deltaX);
      const absDY = Math.abs(e.deltaY);

      // Trackpad horizontal swipe → navigate (timestamp debounce).
      if (!isPinch && absDX > absDY && absDX > 25 && onNavigate) {
        const L = layoutRef.current;
        if (L.zoom <= 1.2) {
          e.preventDefault();
          const now = Date.now();
          if (now - lastNavRef.current > 500) {
            lastNavRef.current = now;
            if (L.zoom > 1.001) resetToFit();
            onNavigate(e.deltaX > 0 ? 1 : -1);
          }
          return;
        }
      }

      // Pinch or vertical scroll → zoom.
      if (isPinch || absDY > absDX) {
        e.preventDefault();
        const L = layoutRef.current;
        const delta = -e.deltaY * 0.003;
        setZoom(L.zoom + delta * L.zoom, e.clientX, e.clientY);
      }
    },
    [setZoom, onNavigate, resetToFit],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isAtFit()) return;
      e.preventDefault();
      const L = layoutRef.current;
      gestureRef.current = {
        ...newGestureState(),
        type: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startTransformX: L.panX,
        startTransformY: L.panY,
      };
    },
    [isAtFit],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (gestureRef.current.type !== "pan") return;
      const g = gestureRef.current;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const clamped = clampPan(g.startTransformX + dx, g.startTransformY + dy, layoutRef.current.zoom);
      const L = layoutRef.current;
      L.panX = clamped.x;
      L.panY = clamped.y;
      applyLayout();
    };
    const handleMouseUp = () => {
      gestureRef.current = newGestureState();
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [applyLayout, clampPan]);

  // ---- render ----

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      style={{ touchAction: "none" }}
      onClick={(event) => event.stopPropagation()}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="select-none"
        draggable={false}
        loading="eager"
        decoding="async"
        onLoad={handleImageLoad}
        style={{ display: "block" }}
      />
    </div>
  );
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imgUrls?: string[];
  items?: PreviewMediaItem[];
  initialIndex?: number;
}

function PreviewImageDialog({ open, onOpenChange, imgUrls = [], items, initialIndex = 0 }: Props) {
  const sm = useMediaQuery("sm");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const previewItems = useMemo(
    () => items ?? imgUrls.map((url) => ({ id: url, kind: "image" as const, sourceUrl: url, posterUrl: url, filename: "Image" })),
    [imgUrls, items],
  );

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, open]);

  const itemCount = previewItems.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, itemCount - 1));
  const currentItem = previewItems[safeIndex];
  const hasMultiple = itemCount > 1;
  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < itemCount - 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        return;
      }

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

  const onNavigate = useCallback(
    (direction: -1 | 1) => {
      if (direction < 0) handlePrevious();
      else handleNext();
    },
    [handlePrevious, handleNext],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
        aria-describedby="image-preview-description"
      >
        <VisuallyHidden>
          <DialogTitle>{currentItem.filename || "Attachment preview"}</DialogTitle>
        </VisuallyHidden>

        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{currentItem.filename || "Attachment"}</div>
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

        <div
          className="relative flex h-full w-full items-center justify-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          {currentItem.kind === "video" ? (
            <div className="flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
              <video
                key={currentItem.id}
                src={currentItem.sourceUrl}
                className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]"
                controls
                autoPlay
                playsInline
                disablePictureInPicture
              />
            </div>
          ) : currentItem.kind === "motion" ? (
            <div className="flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
              <MotionPhotoPreview
                key={currentItem.id}
                posterUrl={currentItem.posterUrl}
                motionUrl={currentItem.motionUrl}
                alt={`Preview live photo ${safeIndex + 1} of ${itemCount}`}
                presentationTimestampUs={currentItem.presentationTimestampUs}
                badgeClassName="left-3 top-3 sm:left-4 sm:top-4"
                mediaClassName="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]"
              />
            </div>
          ) : (
            <ZoomableImage
              src={currentItem.sourceUrl}
              alt={`Preview image ${safeIndex + 1} of ${itemCount}`}
              onNavigate={onNavigate}
            />
          )}
        </div>

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

        <div id="image-preview-description" className="sr-only">
          Attachment preview dialog. Press Escape to close and use left or right arrow keys to switch items.
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PreviewImageDialog;
