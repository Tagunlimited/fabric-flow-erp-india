import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { initializeFormPersistence, addFormPersistenceCSS } from './utils/autoFormPersistence'
import { setupInstallPrompt } from './utils/pwaInstall'

// Add form persistence CSS
addFormPersistenceCSS();

// Setup PWA install prompt
setupInstallPrompt();

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      if (import.meta.env.PROD) {
        // Production: Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        console.log('✅ Service Worker registered:', registration);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 New service worker available. Refresh to update.');
                // Optionally show update notification to user
              }
            });
          }
        });
      } else {
        // Development: Unregister existing service workers to avoid caching issues
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('🧹 Service worker unregistered for development');
        }
      }
    } catch (error) {
      console.error('❌ Service worker registration failed:', error);
    }
  });
}

// Initialize form persistence
initializeFormPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
