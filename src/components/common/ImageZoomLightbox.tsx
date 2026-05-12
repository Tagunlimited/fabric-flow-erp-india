import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const WHEEL_FACTOR = 1.08;

export type ImageZoomLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  alt?: string;
  title?: string;
};

export function ImageZoomLightbox({
  open,
  onOpenChange,
  src,
  alt = 'Preview',
  title = 'Image preview',
}: ImageZoomLightboxProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, px: 0, py: 0, stx: 0, sty: 0 });
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    if (open && src) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }, [open, src]);

  const clampScale = useCallback((s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)), []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !open) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = e.deltaY > 0 ? s / WHEEL_FACTOR : s * WHEEL_FACTOR;
        return clampScale(next);
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, src, clampScale]);

  useEffect(() => {
    if (scale <= 1) {
      setTx(0);
      setTy(0);
    }
  }, [scale]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    drag.current = {
      active: true,
      px: e.clientX,
      py: e.clientY,
      stx: tx,
      sty: ty,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setTx(drag.current.stx + (e.clientX - drag.current.px));
    setTy(drag.current.sty + (e.clientY - drag.current.py));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current.active = false;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      pinchStart.current = { dist, scale };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const ratio = dist / pinchStart.current.dist;
      setScale(clampScale(pinchStart.current.scale * ratio));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStart.current = null;
  };

  if (!src) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'fixed left-0 top-0 right-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full min-w-0 max-w-[100vw] translate-x-0 translate-y-0',
          'flex-col gap-0 overflow-hidden border bg-background p-0 shadow-lg rounded-none sm:rounded-none'
        )}
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <DialogHeader className="shrink-0 space-y-0 px-4 pb-2 pt-10">
          <DialogTitle className="pr-8 text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>

        <div
          ref={viewportRef}
          className={cn(
            'relative min-h-0 w-full flex-1 overflow-hidden bg-muted/40',
            scale > 1 ? 'cursor-grab active:cursor-grabbing touch-none' : 'touch-pan-y'
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="absolute inset-0 flex items-center justify-center will-change-transform"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            }}
          >
            <img
              src={src}
              alt={alt}
              className="h-auto max-h-full w-auto max-w-full object-contain select-none pointer-events-none"
              draggable={false}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() => setScale((s) => clampScale(s / WHEEL_FACTOR))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground min-w-[3.5rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() => setScale((s) => clampScale(s * WHEEL_FACTOR))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => {
              setScale(1);
              setTx(0);
              setTy(0);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <p className="text-[11px] text-muted-foreground w-full text-center sm:w-auto sm:ml-2">
            Scroll to zoom · drag when zoomed · pinch on touch
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
