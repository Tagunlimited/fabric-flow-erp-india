import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoPlayerModalProps {
  videoUrl: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoPlayerModal({ videoUrl, title, isOpen, onClose }: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play();
    }
  }, [isOpen]);

  useEffect(() => {
    // Prevent body scroll when modal is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Dark overlay */}
      <div 
        className="absolute inset-0 bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Video container */}
      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-7xl h-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>

          {/* Video player */}
          <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full max-w-full max-h-full object-contain"
              onEnded={onClose}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>
    </div>
  );
}
