import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, X } from 'lucide-react';
import { showInstallPrompt, isAppInstalled, isInstallPromptAvailable, getInstallPromptStatus } from '@/utils/pwaInstall';

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Check install status
    const checkStatus = () => {
      const status = getInstallPromptStatus();
      setIsInstalled(status.installed);
      setCanInstall(status.available);
      
      // Show prompt if install is available and not dismissed recently
      if (status.available && !status.installed) {
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        // Show prompt if not dismissed or dismissed more than 1 day ago
        if (!dismissed || (now - dismissedTime) > oneDay) {
          setShowPrompt(true);
        }
      }
    };

    checkStatus();

    // Listen for install prompt availability
    const handleInstallAvailable = () => {
      checkStatus();
    };

    // Listen for app installed
    const handleInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
    };

    window.addEventListener('pwa-install-available', handleInstallAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const accepted = await showInstallPrompt();
    if (accepted) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already installed
  if (isInstalled) {
    return null;
  }

  // Don't show if can't install
  if (!canInstall) {
    return null;
  }

  return (
    <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install Scissors</DialogTitle>
          <DialogDescription>
            Install this app on your device for a better experience. You'll get:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
            <div>
              <p className="font-medium">Faster access</p>
              <p className="text-sm text-muted-foreground">
                Launch directly from your home screen
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
            <div>
              <p className="font-medium">Offline support</p>
              <p className="text-sm text-muted-foreground">
                Access key features even without internet
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
            <div>
              <p className="font-medium">App-like experience</p>
              <p className="text-sm text-muted-foreground">
                Full-screen mode without browser UI
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDismiss} variant="outline" className="flex-1">
            <X className="mr-2 h-4 w-4" />
            Not now
          </Button>
          <Button onClick={handleInstall} className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Install
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

