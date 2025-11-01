# Comprehensive Caching Implementation for Fabric Flow ERP

This document outlines the comprehensive caching system implemented to prevent page refreshes when switching tabs or browsers, ensuring seamless user experience and data persistence.

## 🎯 Overview

The caching system provides multiple layers of data persistence:
- **Memory Cache**: Fast access to frequently used data
- **localStorage**: Persistent storage across browser sessions
- **sessionStorage**: Temporary storage for current session
- **IndexedDB**: Complex data storage for offline functionality
- **Service Worker**: Offline caching and background sync

## 🏗️ Architecture

### Core Components

1. **AppCacheContext** (`src/contexts/AppCacheContext.tsx`)
   - Central cache management
   - Memory cache with TTL support
   - Automatic persistence to localStorage
   - Cache cleanup and size management

2. **CachedData Hooks** (`src/hooks/useCachedData.ts`)
   - React Query integration
   - Automatic cache invalidation
   - Background refresh
   - Offline data management

3. **CachedPageWrapper** (`src/components/CachedPageWrapper.tsx`)
   - Page state persistence
   - Auto-save functionality
   - Form data caching
   - Navigation state management

4. **Service Worker** (`public/sw.js`)
   - Offline caching strategies
   - Background sync
   - Cache management
   - Network fallback

## 🚀 Features

### 1. Page State Persistence
- **Auto-save**: Automatically saves page state every 30 seconds
- **Form persistence**: Maintains form data across page refreshes
- **Scroll position**: Remembers scroll position
- **Tab state**: Preserves active tabs and filters

### 2. Data Caching
- **Smart TTL**: Different cache times for different data types
- **Background refresh**: Updates data when stale
- **Offline support**: Works without internet connection
- **Cache invalidation**: Automatic cleanup of expired data

### 3. Form Data Management
- **Auto-save**: Saves form data as user types
- **Recovery**: Restores form data after page refresh
- **Validation**: Maintains form validation state
- **Multi-form support**: Handles multiple forms per page

### 4. Offline Functionality
- **Service Worker**: Caches static assets and API responses
- **IndexedDB**: Stores complex data offline
- **Background Sync**: Syncs data when connection is restored
- **Offline UI**: Shows appropriate offline indicators

## 📁 File Structure

```
src/
├── contexts/
│   └── AppCacheContext.tsx          # Main cache context
├── hooks/
│   └── useCachedData.ts            # Cached data hooks
├── components/
│   └── CachedPageWrapper.tsx       # Page wrapper component
├── config/
│   └── cacheConfig.ts              # Cache configuration
├── utils/
│   └── serviceWorker.ts            # Service worker utilities
└── pages/
    ├── EnhancedDashboardCached.tsx # Example cached dashboard
    └── OrdersPageCached.tsx        # Example cached orders page

public/
├── sw.js                           # Service worker
└── offline.html                    # Offline page
```

## 🔧 Configuration

### Cache Settings

```typescript
// Page-specific cache settings
PAGES: {
  dashboard: {
    ttl: 5 * 60 * 1000,        // 5 minutes
    persistToStorage: true,
    autoRefresh: true,
    refreshInterval: 2 * 60 * 1000 // 2 minutes
  },
  orders: {
    ttl: 5 * 60 * 1000,        // 5 minutes
    persistToStorage: true,
    autoRefresh: true,
    refreshInterval: 3 * 60 * 1000 // 3 minutes
  }
  // ... more pages
}
```

### Data Type Settings

```typescript
// Data-specific cache settings
DATA_TYPES: {
  orders: {
    ttl: 5 * 60 * 1000,        // 5 minutes
    persistToStorage: true
  },
  customers: {
    ttl: 15 * 60 * 1000,       // 15 minutes
    persistToStorage: true
  }
  // ... more data types
}
```

## 🎮 Usage

### 1. Basic Page Caching

```tsx
import { CachedPageWrapper } from '@/components/CachedPageWrapper';

function MyPage() {
  return (
    <CachedPageWrapper 
      pageKey="my-page"
      enableAutoSave={true}
      autoSaveInterval={30000}
    >
      <MyPageContent />
    </CachedPageWrapper>
  );
}
```

### 2. Cached Data Fetching

```tsx
import { useCachedData } from '@/hooks/useCachedData';

function MyComponent() {
  const { data, loading, error, refetch } = useCachedData({
    queryKey: ['my-data'],
    queryFn: fetchMyData,
    staleTime: 5 * 60 * 1000,
    cacheConfig: {
      ttl: 10 * 60 * 1000,
      persistToStorage: true
    }
  });

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      {data && <div>{JSON.stringify(data)}</div>}
    </div>
  );
}
```

### 3. Form State Persistence

```tsx
import { useCachedFormState } from '@/hooks/useCachedData';

function MyForm() {
  const { formData, updateFormData, resetFormData } = useCachedFormState(
    'my-form',
    { name: '', email: '' }
  );

  return (
    <form>
      <input 
        value={formData.name}
        onChange={(e) => updateFormData({ ...formData, name: e.target.value })}
      />
      <input 
        value={formData.email}
        onChange={(e) => updateFormData({ ...formData, email: e.target.value })}
      />
    </form>
  );
}
```

### 4. Page State Management

```tsx
import { usePageCaching } from '@/components/CachedPageWrapper';

function MyPage() {
  const { saveState, getState } = usePageCaching('my-page');
  
  const [filters, setFilters] = useState(() => {
    const saved = getState();
    return saved?.filters || {};
  });

  useEffect(() => {
    saveState({ filters, timestamp: Date.now() });
  }, [filters, saveState]);

  return <div>My Page Content</div>;
}
```

## 🔄 Cache Strategies

### 1. Cache First
- Used for static assets
- Checks cache first, falls back to network
- Best for assets that rarely change

### 2. Network First
- Used for API requests
- Tries network first, falls back to cache
- Best for frequently changing data

### 3. Stale While Revalidate
- Used for pages
- Returns cached version immediately
- Updates cache in background
- Best for user experience

## 📊 Cache Management

### Automatic Cleanup
- Removes expired entries
- Limits cache size
- Cleans up old data
- Runs every hour

### Manual Management
```tsx
import { useAppCache } from '@/contexts/AppCacheContext';

function CacheManager() {
  const { clearCache, getCacheStats, cleanupExpiredEntries } = useAppCache();
  
  const handleClearCache = () => {
    clearCache();
  };
  
  const handleCleanup = () => {
    cleanupExpiredEntries();
  };
  
  const stats = getCacheStats();
  
  return (
    <div>
      <p>Total entries: {stats.totalEntries}</p>
      <p>Memory usage: {stats.memoryUsage} bytes</p>
      <button onClick={handleClearCache}>Clear Cache</button>
      <button onClick={handleCleanup}>Cleanup</button>
    </div>
  );
}
```

## 🌐 Offline Support

### Service Worker Registration
```typescript
// Automatically registered in main.tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

### Offline Data Storage
```tsx
import { useOfflineData } from '@/utils/serviceWorker';

function OfflineComponent() {
  const { isOffline, savePendingAction } = useOfflineData();
  
  const handleSubmit = async (data) => {
    if (isOffline) {
      await savePendingAction({
        type: 'CREATE_ORDER',
        data,
        timestamp: Date.now()
      });
    } else {
      await submitToAPI(data);
    }
  };
  
  return (
    <div>
      {isOffline && <div>You're offline. Changes will sync when online.</div>}
      <button onClick={() => handleSubmit(formData)}>Submit</button>
    </div>
  );
}
```

## 🎨 UI Indicators

### Loading States
- Skeleton loaders for cached data
- Loading indicators for fresh data
- Progress bars for long operations

### Offline Indicators
- Network status indicators
- Offline mode badges
- Sync status notifications

### Cache Status
- Debug panel in development
- Cache statistics
- Memory usage indicators

## 🔍 Debugging

### Development Tools
```tsx
// Debug panel (only in development)
{process.env.NODE_ENV === 'development' && (
  <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
    <div>Page: {currentPageKey}</div>
    <div>Status: {isOnline ? 'Online' : 'Offline'}</div>
    <div>Saving: {isSaving ? 'Yes' : 'No'}</div>
    <div>Last Saved: {lastSavedState ? 'Yes' : 'No'}</div>
  </div>
)}
```

### Console Logging
- Cache hit/miss logs
- Data fetch logs
- Error logs
- Performance metrics

## 📈 Performance Benefits

### 1. Faster Page Loads
- Cached data loads instantly
- Reduced API calls
- Background refresh

### 2. Better User Experience
- No data loss on refresh
- Seamless navigation
- Offline functionality

### 3. Reduced Server Load
- Fewer API requests
- Cached responses
- Background sync

### 4. Improved Reliability
- Offline support
- Error recovery
- Data persistence

## 🚨 Error Handling

### Cache Errors
- Graceful fallback to network
- Error logging
- User notifications

### Sync Errors
- Retry mechanisms
- Queue management
- Conflict resolution

### Storage Errors
- Fallback strategies
- Error recovery
- User guidance

## 🔧 Customization

### Custom Cache Keys
```typescript
import { CACHE_KEYS } from '@/config/cacheConfig';

const customKey = CACHE_KEYS.DATA('custom-table', { filter: 'active' });
```

### Custom TTL
```typescript
const customConfig = {
  ttl: 60 * 60 * 1000, // 1 hour
  persistToStorage: true,
  autoRefresh: false
};
```

### Custom Cleanup
```typescript
const customCleanup = {
  interval: 30 * 60 * 1000, // 30 minutes
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 5000
};
```

## 📋 Best Practices

### 1. Cache Strategy
- Use appropriate TTL for data types
- Implement proper cache invalidation
- Monitor cache performance

### 2. Error Handling
- Always provide fallbacks
- Log errors appropriately
- Notify users of issues

### 3. Performance
- Monitor memory usage
- Clean up expired data
- Optimize cache size

### 4. User Experience
- Show loading states
- Provide offline indicators
- Maintain data consistency

## 🎯 Implementation Checklist

- [x] AppCacheContext implementation
- [x] CachedData hooks
- [x] CachedPageWrapper component
- [x] Service Worker setup
- [x] IndexedDB integration
- [x] Offline page
- [x] Cache configuration
- [x] Error handling
- [x] Performance optimization
- [x] Documentation

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Register Service Worker**
   ```typescript
   // Already done in main.tsx
   ```

3. **Wrap Your App**
   ```tsx
   // Already done in App.tsx
   <AppCacheProvider>
     <YourApp />
   </AppCacheProvider>
   ```

4. **Use Cached Components**
   ```tsx
   import { CachedPageWrapper } from '@/components/CachedPageWrapper';
   
   <CachedPageWrapper pageKey="your-page">
     <YourPageContent />
   </CachedPageWrapper>
   ```

5. **Test Caching**
   - Switch tabs
   - Refresh page
   - Go offline
   - Check data persistence

## 📞 Support

For issues or questions about the caching implementation:
1. Check the console logs
2. Review the cache configuration
3. Test offline functionality
4. Monitor performance metrics

The caching system is designed to be robust, performant, and user-friendly, providing a seamless experience across all scenarios.
