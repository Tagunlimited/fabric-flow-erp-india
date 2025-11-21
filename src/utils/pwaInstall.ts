/**
 * PWA Install Prompt Utilities
 * Handles the "Add to Home Screen" functionality
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Listen for the beforeinstallprompt event
 * This event is fired when the browser thinks the app is installable
 */
export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('✅ PWA install prompt available');
    
    // Dispatch custom event to notify the app
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  // Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA was installed');
    deferredPrompt = null;
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

/**
 * Show the install prompt
 * Returns true if prompt was shown, false if not available
 */
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) {
    console.log('⚠️ Install prompt not available');
    return false;
  }

  try {
    // Show the install prompt
    await deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`User response to install prompt: ${outcome}`);
    
    // Clear the deferred prompt
    deferredPrompt = null;
    
    return outcome === 'accepted';
  } catch (error) {
    console.error('Error showing install prompt:', error);
    return false;
  }
}

/**
 * Check if the app is already installed
 */
export function isAppInstalled(): boolean {
  // Check if running in standalone mode (installed PWA)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  
  // Check for iOS standalone mode
  if ((window.navigator as any).standalone === true) {
    return true;
  }
  
  return false;
}

/**
 * Check if install prompt is available
 */
export function isInstallPromptAvailable(): boolean {
  return deferredPrompt !== null;
}

/**
 * Get install prompt availability status
 */
export function getInstallPromptStatus(): {
  available: boolean;
  installed: boolean;
} {
  return {
    available: isInstallPromptAvailable(),
    installed: isAppInstalled(),
  };
}

