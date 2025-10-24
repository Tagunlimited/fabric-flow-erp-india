// Service Worker Registration and Management
export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;
  private isSupported: boolean = false;

  private constructor() {
    this.isSupported = 'serviceWorker' in navigator;
  }

  public static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  public async register(): Promise<boolean> {
    if (!this.isSupported) {
      console.log('Service Worker not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('Service Worker registered successfully:', this.registration);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration?.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, notify user
              this.notifyUpdate();
            }
          });
        }
      });

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  public async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const result = await this.registration.unregister();
      console.log('Service Worker unregistered:', result);
      this.registration = null;
      return result;
    } catch (error) {
      console.error('Service Worker unregistration failed:', error);
      return false;
    }
  }

  public async update(): Promise<void> {
    if (!this.registration) {
      return;
    }

    try {
      await this.registration.update();
    } catch (error) {
      console.error('Service Worker update failed:', error);
    }
  }

  public async getCacheSize(): Promise<number> {
    if (!this.registration?.active) {
      return 0;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_SIZE') {
          resolve(event.data.size);
        }
      };

      this.registration?.active?.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    });
  }

  public async clearCache(): Promise<void> {
    if (!this.registration?.active) {
      return;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = () => {
        resolve();
      };

      this.registration?.active?.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });
  }

  public async cacheData(url: string, data: any): Promise<void> {
    if (!this.registration?.active) {
      return;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = () => {
        resolve();
      };

      this.registration?.active?.postMessage(
        { 
          type: 'CACHE_DATA', 
          payload: { url, data } 
        },
        [messageChannel.port2]
      );
    });
  }

  private notifyUpdate(): void {
    // You can customize this notification
    if (confirm('New version available! Reload to update?')) {
      window.location.reload();
    }
  }

  public isOnline(): boolean {
    return navigator.onLine;
  }

  public addOnlineListener(callback: () => void): void {
    window.addEventListener('online', callback);
  }

  public addOfflineListener(callback: () => void): void {
    window.addEventListener('offline', callback);
  }

  public removeOnlineListener(callback: () => void): void {
    window.removeEventListener('online', callback);
  }

  public removeOfflineListener(callback: () => void): void {
    window.removeEventListener('offline', callback);
  }
}

// React hook for service worker
export function useServiceWorker() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [swManager] = useState(() => ServiceWorkerManager.getInstance());

  useEffect(() => {
    // Register service worker
    swManager.register();

    // Set up online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    swManager.addOnlineListener(handleOnline);
    swManager.addOfflineListener(handleOffline);

    return () => {
      swManager.removeOnlineListener(handleOnline);
      swManager.removeOfflineListener(handleOffline);
    };
  }, [swManager]);

  return {
    isOnline,
    swManager,
    register: () => swManager.register(),
    unregister: () => swManager.unregister(),
    update: () => swManager.update(),
    getCacheSize: () => swManager.getCacheSize(),
    clearCache: () => swManager.clearCache(),
    cacheData: (url: string, data: any) => swManager.cacheData(url, data)
  };
}

// Utility functions for offline data management
export class OfflineDataManager {
  private static dbName = 'OfflineData';
  private static version = 1;

  public static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = () => {
        const db = request.result;

        // Create object stores
        if (!db.objectStoreNames.contains('pendingActions')) {
          db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('cachedData')) {
          db.createObjectStore('cachedData', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('formStates')) {
          db.createObjectStore('formStates', { keyPath: 'formKey' });
        }
      };
    });
  }

  public static async savePendingAction(action: any): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    
    return new Promise((resolve, reject) => {
      const request = store.add(action);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async getPendingActions(): Promise<any[]> {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingActions'], 'readonly');
    const store = transaction.objectStore('pendingActions');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  public static async removePendingAction(id: number): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveCachedData(key: string, data: any): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['cachedData'], 'readwrite');
    const store = transaction.objectStore('cachedData');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, data, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async getCachedData(key: string): Promise<any> {
    const db = await this.openDB();
    const transaction = db.transaction(['cachedData'], 'readonly');
    const store = transaction.objectStore('cachedData');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (result && Date.now() - result.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  public static async saveFormState(formKey: string, state: any): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(['formStates'], 'readwrite');
    const store = transaction.objectStore('formStates');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ formKey, state, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public static async getFormState(formKey: string): Promise<any> {
    const db = await this.openDB();
    const transaction = db.transaction(['formStates'], 'readonly');
    const store = transaction.objectStore('formStates');
    
    return new Promise((resolve, reject) => {
      const request = store.get(formKey);
      request.onsuccess = () => {
        const result = request.result;
        if (result && Date.now() - result.timestamp < 7 * 24 * 60 * 60 * 1000) { // 7 days
          resolve(result.state);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// React hook for offline data management
export function useOfflineData() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const savePendingAction = useCallback(async (action: any) => {
    try {
      await OfflineDataManager.savePendingAction(action);
    } catch (error) {
      console.error('Failed to save pending action:', error);
    }
  }, []);

  const getPendingActions = useCallback(async () => {
    try {
      return await OfflineDataManager.getPendingActions();
    } catch (error) {
      console.error('Failed to get pending actions:', error);
      return [];
    }
  }, []);

  const removePendingAction = useCallback(async (id: number) => {
    try {
      await OfflineDataManager.removePendingAction(id);
    } catch (error) {
      console.error('Failed to remove pending action:', error);
    }
  }, []);

  const saveCachedData = useCallback(async (key: string, data: any) => {
    try {
      await OfflineDataManager.saveCachedData(key, data);
    } catch (error) {
      console.error('Failed to save cached data:', error);
    }
  }, []);

  const getCachedData = useCallback(async (key: string) => {
    try {
      return await OfflineDataManager.getCachedData(key);
    } catch (error) {
      console.error('Failed to get cached data:', error);
      return null;
    }
  }, []);

  return {
    isOffline,
    savePendingAction,
    getPendingActions,
    removePendingAction,
    saveCachedData,
    getCachedData
  };
}
