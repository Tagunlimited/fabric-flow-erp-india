import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

interface VideoThumbnailProps {
  videoUrl: string;
  title: string;
  className?: string;
}

export function VideoThumbnail({ videoUrl, title, className = '' }: VideoThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const generateThumbnail = () => {
      try {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        
        // Draw the current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setThumbnailUrl(dataUrl);
        setLoading(false);
      } catch (error) {
        console.error('Error generating thumbnail:', error);
        setLoading(false);
      }
    };

    const handleLoadedMetadata = () => {
      // Seek to 1 second (or 10% of video, whichever is smaller)
      const seekTime = Math.min(1, (video.duration || 10) * 0.1);
      video.currentTime = seekTime;
    };

    const handleSeeked = () => {
      generateThumbnail();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [videoUrl]);

  return (
    <div className={`relative bg-muted rounded overflow-hidden group ${className}`}>
      {/* Hidden video element for thumbnail generation */}
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        muted
        className="hidden"
        crossOrigin="anonymous"
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Display thumbnail or loading state */}
      {thumbnailUrl ? (
        <>
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-primary ml-0.5" fill="currentColor" />
            </div>
          </div>
        </>
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Play className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
