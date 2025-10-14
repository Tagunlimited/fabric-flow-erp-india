import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { X, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingNotificationProps {
  notification: {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null;
  onDismiss: () => void;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  sound?: boolean;
}

export function FloatingNotification({ 
  notification, 
  onDismiss, 
  position = 'bottom-right',
  sound = true 
}: FloatingNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      
      // Play scissor cut sound effect
      if (sound) {
        playScissorSound();
      }
      
      // Auto dismiss after 5 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const playScissorSound = () => {
    // Create a simple scissor-like sound using Web Audio API
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        console.warn('AudioContext not supported in this environment.');
        return;
      }
      const audioContext = new AudioContext();
      
      // Create two quick snip sounds
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
        }, i * 150);
      }
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'bottom-4 right-4';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-l-4 border-l-success bg-success/10';
      case 'warning':
        return 'border-l-4 border-l-warning bg-warning/10';
      case 'error':
        return 'border-l-4 border-l-error bg-error/10';
      default:
        return 'border-l-4 border-l-primary bg-primary/10';
    }
  };

  if (!notification) return null;

  return (
    <div className={`fixed z-50 ${getPositionClasses()}`}>
      {isVisible && (
        <div className={`transform transition-all duration-300 ease-out ${
          isVisible 
            ? 'opacity-100 translate-x-0 scale-100' 
            : `opacity-0 ${position.includes('right') ? 'translate-x-24' : '-translate-x-24'} scale-95`
        }`}>
          <Card className={`w-80 shadow-lg ${getTypeColor(notification.type)}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="p-1 rounded-full bg-primary/20">
                    <Bell className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}