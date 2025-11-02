import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { initializeFormPersistence, addFormPersistenceCSS } from './utils/autoFormPersistence'

// Add form persistence CSS
addFormPersistenceCSS();

// Register service worker only in production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
} else if ('serviceWorker' in navigator && !import.meta.env.PROD) {
  // Unregister service worker in development to avoid caching issues
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('Service worker unregistered for development');
      }
    } catch (error) {
      console.log('Service worker unregistration skipped:', error);
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
