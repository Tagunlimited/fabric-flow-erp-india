import { type SyntheticEvent } from 'react';
import { getOrderCardPlaceholderSrc } from '@/utils/orderItemImageUtils';
import { cn } from '@/lib/utils';

export function resolveOrderImageUrls(
  imageUrls?: string[],
  imageUrl?: string
): string[] {
  if (imageUrls?.length) return imageUrls;
  if (imageUrl) return [imageUrl];
  return [getOrderCardPlaceholderSrc()];
}

type OrderMultiImagePanelProps = {
  urls: string[];
  alt: string;
  /** portrait card (QC/dispatch modal) vs compact square (dispatch list card) */
  variant?: 'portrait' | 'compact';
  className?: string;
};

export function OrderMultiImagePanel({
  urls,
  alt,
  variant = 'portrait',
  className,
}: OrderMultiImagePanelProps) {
  const placeholder = getOrderCardPlaceholderSrc();
  const images = urls.length > 0 ? urls : [placeholder];
  const visible = images.slice(0, 4);
  const extraCount = images.length - visible.length;

  const onImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.src.endsWith(placeholder)) {
      el.style.display = 'none';
      return;
    }
    el.src = placeholder;
  };

  const thumb = (url: string, imgClassName?: string) => (
    <img
      src={url}
      alt={alt}
      className={imgClassName ?? 'max-h-full max-w-full object-contain'}
      onError={onImgError}
    />
  );

  if (variant === 'compact') {
    if (visible.length === 1) {
      return (
        <div className={cn('relative h-full w-full overflow-hidden rounded-lg', className)}>
          <img
            src={visible[0]}
            alt={alt}
            className="h-full w-full object-cover"
            onError={onImgError}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          'grid h-full w-full gap-px overflow-hidden rounded-lg',
          visible.length === 2 ? 'grid-rows-2 grid-cols-1' : 'grid-cols-2 grid-rows-2',
          className
        )}
      >
        {visible.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative min-h-0 overflow-hidden">
            <img src={url} alt={alt} className="h-full w-full object-cover" onError={onImgError} />
            {extraCount > 0 && idx === visible.length - 1 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white">
                +{extraCount}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 1) {
    return (
      <div className={cn('absolute inset-0 flex items-center justify-center p-4 sm:p-5', className)}>
        {thumb(visible[0], 'max-h-[85%] max-w-[85%] object-contain')}
      </div>
    );
  }

  if (visible.length === 2) {
    return (
      <div className={cn('absolute inset-0 flex flex-col gap-2 p-3 sm:p-4', className)}>
        {visible.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="flex flex-1 min-h-0 items-center justify-center rounded-lg bg-white/50"
          >
            {thumb(url)}
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 3) {
    return (
      <div className={cn('absolute inset-0 flex flex-col gap-2 p-3 sm:p-4', className)}>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {visible.slice(0, 2).map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="flex min-h-0 items-center justify-center rounded-lg bg-white/50"
            >
              {thumb(url)}
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-white/50">
          {thumb(visible[2])}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('absolute inset-0 grid grid-cols-2 grid-rows-2 gap-2 p-3 sm:p-4', className)}>
      {visible.map((url, idx) => (
        <div
          key={`${url}-${idx}`}
          className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-white/50"
        >
          {thumb(url)}
          {extraCount > 0 && idx === visible.length - 1 ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-sm font-semibold text-white">
              +{extraCount}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
