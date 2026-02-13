import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt: string;
  fallbackText?: string;
  className?: string;
  containerClassName?: string;
  showFallback?: boolean;
  onError?: (error: string) => void;
}

export function OptimizedImage({
  src,
  alt,
  fallbackText = 'IMG',
  className,
  containerClassName,
  showFallback = true,
  onError,
  ...props
}: OptimizedImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleError = useCallback(() => {
    setImageError(true);
    setImageLoading(false);
    onError?.(`Failed to load image: ${src}`);
  }, [src, onError]);

  const handleLoad = useCallback(() => {
    setImageLoading(false);
    setImageError(false);
  }, []);

  // If no src or error occurred, show fallback or return null
  if (!src || imageError) {
    if (!showFallback) {
      return null;
    }
    return (
      <div 
        className={cn(
          "bg-muted flex items-center justify-center text-xs text-muted-foreground",
          containerClassName
        )}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <div className={cn("relative", containerClassName)}>
      {imageLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "transition-opacity duration-200",
          imageLoading ? "opacity-0" : "opacity-100",
          className
        )}
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
        {...props}
      />
    </div>
  );
}

// Specialized components for common use cases
export function ItemImage({ 
  src, 
  alt, 
  className = "w-12 h-12 object-cover rounded",
  ...props 
}: Omit<OptimizedImageProps, 'containerClassName'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      containerClassName={className}
      fallbackText="IMG"
      {...props}
    />
  );
}

export function LogoImage({ 
  src, 
  alt, 
  className = "max-h-12 max-w-32 object-contain",
  ...props 
}: Omit<OptimizedImageProps, 'containerClassName'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      containerClassName="flex items-center justify-center"
      fallbackText="LOGO"
      {...props}
    />
  );
}

export function ProductImage({ 
  src, 
  alt, 
  className = "w-20 h-20 object-cover rounded",
  ...props 
}: Omit<OptimizedImageProps, 'containerClassName'>) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      containerClassName={className}
      fallbackText="PROD"
      {...props}
    />
  );
}
