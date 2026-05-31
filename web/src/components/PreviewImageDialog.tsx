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

// ============================================================================
// Props
// ============================================================================

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imgUrls?: string[];
  items?: PreviewMediaItem[];
  initialIndex?: number;
}

// ============================================================================
// ZoomableImage
//   - 始终 absolute 定位，用 fit 计算拟合容器
//   - zoom+pan 通过 transform 叠加在 fit 之上
//   - 锚点缩放：setZoom(z, cx, cy) 保持容器点 (cx,cy) 固定
// ============================================================================

const MAX_SCALE = 5;
const DBL_TAP_FACTOR = 2.5;
const SWIPE_THRESHOLD = 40;
const DBL_TAP_DELAY = 300;

const newGestureState = () => ({
  type: "none" as "none" | "pan" | "pinch",
  startX: 0,
  startY: 0,
  startTX: 0,
  startTY: 0,
  pinchDist0: 0,
  pinchScale0: 1,
  pinchCX: 0,
  pinchCY: 0,
  touchStartX: 0,
  touchStartY: 0,
  lastTouchX: 0,
  lastTouchY: 0,
});

interface ZProps {
  src: string;
  alt: string;
  onSwipeDelta?: (dx: number) => void;
}

const ZoomableImage: React.FC<ZProps> = ({ src, alt, onSwipeDelta }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // fit: 图片缩放到恰好容纳容器的位置和尺寸
  const fitRef = useRef({ x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0, ready: false });
  // zoom: fit 之上的额外缩放和偏移
  const L = useRef({ zoom: 1, panX: 0, panY: 0 });
  const lastTapRef = useRef(0);
  const gestureRef = useRef(newGestureState());
  const rafRef = useRef(0);
  const pendingTransitionRef = useRef("");
  const gestureZoomRef = useRef(1); // Safari gesture start zoom

  // --- DOM 写入（合并到单次 cssText，减少样式重算次数） ---
  const applyLayout = useCallback((transition?: string) => {
    const img = imgRef.current;
    if (!img) return;
    const f = fitRef.current;
    if (!f.ready) {
      img.style.cssText = "display:block;max-width:100%;max-height:100%";
      return;
    }
    const t = transition || "none";
    if (L.current.zoom <= 1.001) {
      img.style.cssText = `display:block;position:absolute;left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;max-width:none;max-height:none;transform:none;transform-origin:0 0;transition:${t};will-change:transform`;
    } else {
      img.style.cssText = `display:block;position:absolute;left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;max-width:none;max-height:none;transform:translate(${L.current.panX}px,${L.current.panY}px) scale(${L.current.zoom});transform-origin:0 0;transition:${t};will-change:transform`;
    }
  }, []);

  // --- 调度 DOM 写入到下一帧，触控板高频事件只写最后一次 ---
  const scheduleLayout = useCallback((transition?: string) => {
    if (transition) pendingTransitionRef.current = transition;
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyLayout(pendingTransitionRef.current);
      pendingTransitionRef.current = "";
    });
  }, [applyLayout]);

  // --- 计算 fit ---
  const computeFit = useCallback(() => {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (cw < 50 || ch < 50) return;
    const s = Math.min(cw / nw, ch / nh, 1);
    const f = fitRef.current;
    f.w = nw * s;
    f.h = nh * s;
    f.x = (cw - f.w) / 2;
    f.y = (ch - f.h) / 2;
    f.cw = cw;
    f.ch = ch;
    f.ready = true;
  }, []);

  const resetToFit = useCallback((transition?: string) => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    L.current.zoom = 1;
    L.current.panX = 0;
    L.current.panY = 0;
    applyLayout(transition);
  }, [applyLayout]);

  const isAtFit = useCallback(() => L.current.zoom <= 1.001, []);

  // --- pan 钳制 ---
  const clampPan = useCallback((px: number, py: number, z: number) => {
    const f = fitRef.current;
    if (!f.ready) return { x: 0, y: 0 };
    const sw = f.w * z;
    const sh = f.h * z;
    let cx = px, cy = py;
    if (sw <= f.cw) cx = (f.cw - sw) / 2 - f.x;
    else cx = Math.max(f.cw - f.x - sw, Math.min(-f.x, px));
    if (sh <= f.ch) cy = (f.ch - sh) / 2 - f.y;
    else cy = Math.max(f.ch - f.y - sh, Math.min(-f.y, py));
    return { x: cx, y: cy };
  }, []);

  // --- 缩放（带锚点） ---
  const setZoom = useCallback((newZoom: number, cx: number, cy: number, transition?: string) => {
    const f = fitRef.current;
    if (!f.ready) return;
    const z = Math.max(1, Math.min(MAX_SCALE, newZoom));
    if (z <= 1.001) { resetToFit(transition); return; }
    const pz = L.current.zoom || 1;
    // 容器点 (cx,cy) 对应的图片像素坐标
    const ix = (cx - f.x - L.current.panX) / pz;
    const iy = (cy - f.y - L.current.panY) / pz;
    const px = cx - f.x - ix * z;
    const py = cy - f.y - iy * z;
    const clamped = clampPan(px, py, z);
    L.current.zoom = z;
    L.current.panX = clamped.x;
    L.current.panY = clamped.y;
    scheduleLayout(transition);
  }, [scheduleLayout, clampPan, resetToFit]);

  // --- 图片加载 / src 变化 ---
  const onLoad = useCallback(() => { computeFit(); resetToFit(); }, [computeFit, resetToFit]);

  useEffect(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth) { computeFit(); resetToFit(); }
  }, [src, computeFit, resetToFit]);

  // --- 容器 resize ---
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    let prevW = 0;
    const ro = new ResizeObserver(() => {
      const img = imgRef.current;
      if (!img?.naturalWidth) return;
      const wasFit = L.current.zoom <= 1.001;
      prevW = fitRef.current.w;
      computeFit();
      if (wasFit || prevW === 0) { resetToFit(); return; }
      // 保持缩放，重钳 pan
      const z = L.current.zoom;
      const clamped = clampPan(L.current.panX, L.current.panY, z);
      L.current.panX = clamped.x;
      L.current.panY = clamped.y;
      scheduleLayout();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [computeFit, resetToFit, scheduleLayout, clampPan]);

  // --- Touch ---

  const touchDist = (ts: React.TouchList, i: number, j: number) =>
    Math.hypot(ts[i].clientX - ts[j].clientX, ts[i].clientY - ts[j].clientY);

  const touchMid = (ts: React.TouchList, i: number, j: number) => ({
    x: (ts[i].clientX + ts[j].clientX) / 2,
    y: (ts[i].clientY + ts[j].clientY) / 2,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const ts = e.touches;
    if (ts.length === 1) {
      const now = Date.now();
      gestureRef.current = {
        ...newGestureState(),
        type: "pan",
        startX: ts[0].clientX, startY: ts[0].clientY,
        startTX: L.current.panX, startTY: L.current.panY,
        touchStartX: ts[0].clientX, touchStartY: ts[0].clientY,
        lastTouchX: ts[0].clientX, lastTouchY: ts[0].clientY,
      };
      if (now - lastTapRef.current < DBL_TAP_DELAY) {
        e.preventDefault();
        if (L.current.zoom > 1.001) resetToFit("transform 0.3s ease-out");
        else setZoom(L.current.zoom * DBL_TAP_FACTOR, ts[0].clientX, ts[0].clientY, "transform 0.3s ease-out");
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    } else if (ts.length === 2) {
      gestureRef.current = {
        ...newGestureState(),
        type: "pinch",
        pinchDist0: touchDist(ts, 0, 1),
        pinchScale0: L.current.zoom,
        startTX: L.current.panX, startTY: L.current.panY,
        pinchCX: touchMid(ts, 0, 1).x, pinchCY: touchMid(ts, 0, 1).y,
      };
    }
  }, [setZoom, resetToFit]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;
    const ts = e.touches;
    if (ts.length === 1 && g.type === "pan") {
      g.lastTouchX = ts[0].clientX;
      g.lastTouchY = ts[0].clientY;
      if (!isAtFit()) {
        const dx = ts[0].clientX - g.startX;
        const dy = ts[0].clientY - g.startY;
        const clamped = clampPan(g.startTX + dx, g.startTY + dy, L.current.zoom);
        L.current.panX = clamped.x;
        L.current.panY = clamped.y;
        scheduleLayout();
      }
    } else if (ts.length === 2 && g.type === "pinch") {
      e.preventDefault();
      const dist = touchDist(ts, 0, 1);
      const ratio = dist / g.pinchDist0;
      setZoom(g.pinchScale0 * ratio, g.pinchCX, g.pinchCY);
    }
  }, [scheduleLayout, clampPan, setZoom, isAtFit]);

  const onTouchEnd = useCallback(() => {
    const g = gestureRef.current;
    if (g.type === "pan" && isAtFit() && onSwipeDelta) {
      const dx = g.lastTouchX - g.touchStartX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) onSwipeDelta(dx);
    }
    gestureRef.current = newGestureState();
  }, [onSwipeDelta, isAtFit]);

  // --- Mouse ---

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (L.current.zoom > 1.001) resetToFit("transform 0.3s ease-out");
    else setZoom(L.current.zoom * DBL_TAP_FACTOR, e.clientX, e.clientY, "transform 0.3s ease-out");
  }, [setZoom, resetToFit]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const handler = (e: WheelEvent) => {
      const isPinch = e.ctrlKey || e.metaKey;
      const adx = Math.abs(e.deltaX), ady = Math.abs(e.deltaY);

      // Horizontal swipe: report delta to parent, prevent default
      if (!isPinch && adx * 2 > ady && onSwipeDelta) {
        onSwipeDelta(e.deltaX);
        e.preventDefault();
        return;
      }

      // Zoom
      if (isPinch || ady > adx * 0.7) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.005);
        setZoom(L.current.zoom * factor, e.clientX, e.clientY);
      }
    };
    c.addEventListener("wheel", handler, { passive: false });
    return () => c.removeEventListener("wheel", handler);
  }, [setZoom, onSwipeDelta]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (isAtFit()) return;
    e.preventDefault();
    gestureRef.current = {
      ...newGestureState(),
      type: "pan",
      startX: e.clientX, startY: e.clientY,
      startTX: L.current.panX, startTY: L.current.panY,
    };
  }, [isAtFit]);

  // 全局 mousemove/mouseup — 防止鼠标拖拽到元素外丢失
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (gestureRef.current.type !== "pan") return;
      const g = gestureRef.current;
      const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
      const clamped = clampPan(g.startTX + dx, g.startTY + dy, L.current.zoom);
      L.current.panX = clamped.x; L.current.panY = clamped.y;
      scheduleLayout();
    };
    const mu = () => { gestureRef.current = newGestureState(); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [scheduleLayout, clampPan]);

  // --- Safari gesture events (pinch zoom) ---
  const onGestureStart = useCallback((e: React.GestureEvent) => {
    e.preventDefault();
    gestureZoomRef.current = L.current.zoom;
  }, []);

  const onGestureChange = useCallback((e: React.GestureEvent) => {
    e.preventDefault();
    setZoom(gestureZoomRef.current * e.scale, e.clientX, e.clientY);
  }, [setZoom]);

  const onGestureEnd = useCallback((e: React.GestureEvent) => {
    e.preventDefault();
    if (L.current.zoom <= 1.05) resetToFit();
  }, [resetToFit]);

  // --- 图片加载失败 ---
  const onError = useCallback(() => {
    fitRef.current = { x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0, ready: false };
    applyLayout();
  }, [applyLayout]);

  // --- render ---
  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onGestureStart={onGestureStart}
      onGestureChange={onGestureChange}
      onGestureEnd={onGestureEnd}
      onClick={(e) => e.stopPropagation()}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="select-none"
        draggable={false}
        loading="eager"
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        style={{ display: "block" }}
      />
    </div>
  );
};

// ============================================================================
// PreviewImageDialog
// ============================================================================

function PreviewImageDialog({ open, onOpenChange, imgUrls = [], items, initialIndex = 0 }: Props) {
  const sm = useMediaQuery("sm");
  const [idx, setIdx] = useState(initialIndex);
  const previewItems = useMemo(
    () => items ?? imgUrls.map((url) => ({ id: url, kind: "image" as const, sourceUrl: url, posterUrl: url, filename: "Image" })),
    [imgUrls, items],
  );

  useEffect(() => { if (open) setIdx(initialIndex); }, [initialIndex, open]);

  const total = previewItems.length;
  const cur = Math.max(0, Math.min(idx, total - 1));
  const it = previewItems[cur];

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowLeft") setIdx((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setIdx((p) => Math.min(total - 1, p + 1));
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [total, onOpenChange, open]);

  const swipeAccRef = useRef(0);
  const swipeLockRef = useRef(false);
  const swipeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSwipeDelta = useCallback((dx: number) => {
    swipeAccRef.current += dx;
    clearTimeout(swipeTimerRef.current);
    if (!swipeLockRef.current && Math.abs(swipeAccRef.current) > 150) {
      setIdx((p) => { const n = p + (swipeAccRef.current > 0 ? 1 : -1); return n >= 0 && n < total ? n : p; });
      swipeAccRef.current = 0;
      swipeLockRef.current = true;
    }
    swipeTimerRef.current = setTimeout(() => {
      swipeLockRef.current = false;
      swipeAccRef.current = 0;
    }, 100);
  }, [total]);

  if (!total || !it) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!h-[100vh] !w-[100vw] !max-h-[100vh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
        aria-describedby="img-pv"
      >
        <VisuallyHidden><DialogTitle>{it.filename || "Preview"}</DialogTitle></VisuallyHidden>

        <div className="absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{it.filename || "Attachment"}</div>
              {total > 1 && <div className="mt-1 text-xs text-white/70">{cur + 1} / {total}</div>}
            </div>
            <Button type="button" onClick={() => onOpenChange(false)} variant="ghost" size="icon" className="shrink-0 rounded-full bg-white/10 text-white hover:bg-white/16" aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="relative flex h-full w-full items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}>
          {it.kind === "video" ? (
            <div className="flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <video key={it.id} src={it.sourceUrl} className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]" controls autoPlay playsInline />
            </div>
          ) : it.kind === "motion" ? (
            <div className="flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <MotionPhotoPreview key={it.id} posterUrl={it.posterUrl} motionUrl={it.motionUrl} alt={`${cur + 1} / ${total}`} presentationTimestampUs={it.presentationTimestampUs} badgeClassName="left-3 top-3 sm:left-4 sm:top-4" mediaClassName="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100vh-7rem)] sm:max-w-[calc(100vw-8rem)]" />
            </div>
          ) : (
            <ZoomableImage src={it.sourceUrl} alt={`${cur + 1} / ${total}`} onSwipeDelta={onSwipeDelta} />
          )}
        </div>

        {total > 1 && sm && (
          <>
            <PreviewNavButton side="left" disabled={cur === 0} label="Previous" onClick={() => setIdx((p) => Math.max(0, p - 1))} icon={<ChevronLeft className="h-5 w-5" />} />
            <PreviewNavButton side="right" disabled={cur === total - 1} label="Next" onClick={() => setIdx((p) => Math.min(total - 1, p + 1))} icon={<ChevronRight className="h-5 w-5" />} />
          </>
        )}
        {total > 1 && !sm && <MobileNavBar current={cur + 1} total={total} canGoPrevious={cur > 0} canGoNext={cur < total - 1} onPrevious={() => setIdx((p) => Math.max(0, p - 1))} onNext={() => setIdx((p) => Math.min(total - 1, p + 1))} />}

        <div id="img-pv" className="sr-only">Preview</div>
      </DialogContent>
    </Dialog>
  );
}

export default PreviewImageDialog;
