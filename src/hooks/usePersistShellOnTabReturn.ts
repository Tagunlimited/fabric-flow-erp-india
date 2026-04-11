import { useEffect } from 'react';

const FORM_PERSISTENCE_LS = 'formPersistence';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Read one key's `.data` from the debounced formPersistence localStorage blob (context may be ahead or behind). */
export function readFormPersistenceDataFromStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(FORM_PERSISTENCE_LS);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as Record<string, { data?: unknown; timestamp?: number }>;
    const entry = p[key];
    if (entry == null || typeof entry.timestamp !== 'number') return undefined;
    if (Date.now() - entry.timestamp > MAX_AGE_MS) return undefined;
    return entry.data;
  } catch {
    return undefined;
  }
}

export interface UsePersistShellOnTabReturnOptions {
  /** e.g. `customerList_showForm` — truthy means "shell should be open" */
  showOpenKey: string;
  /** e.g. `customerList_formClosed` — true means user dismissed; do not reopen */
  explicitCloseKey: string;
  /** Optional draft key (e.g. `customerForm`) — reopen shell if draft exists */
  draftFormKey?: string;
  setShow: (open: boolean) => void;
}

/**
 * Keeps list→full-page form shells open across browser tab switches, bfcache, and multi-tab localStorage updates.
 * Pair with saveFormData for the same keys when toggling the shell.
 */
export function usePersistShellOnTabReturn({
  showOpenKey,
  explicitCloseKey,
  draftFormKey,
  setShow,
}: UsePersistShellOnTabReturnOptions) {
  useEffect(() => {
    const apply = () => {
      // Always read from localStorage directly to avoid React state timing issues
      const wantOpen = readFormPersistenceDataFromStorage(showOpenKey) === true;
      const explicitClose = readFormPersistenceDataFromStorage(explicitCloseKey) === true;
      
      // Check for draft data if draftFormKey is provided
      let hasDraft = false;
      if (draftFormKey) {
        const draftData = readFormPersistenceDataFromStorage(draftFormKey);
        hasDraft = draftData !== undefined && draftData !== null && 
                  (typeof draftData !== 'object' || Object.keys(draftData as object).length > 0);
      }

      if (!explicitClose && (wantOpen || hasDraft)) {
        setShow(true);
      } else if (explicitClose) {
        setShow(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      requestAnimationFrame(apply);
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) apply();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === FORM_PERSISTENCE_LS && e.newValue) apply();
    };

    const hydrateId = window.setTimeout(apply, 0);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(hydrateId);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('storage', onStorage);
    };
  }, [draftFormKey, showOpenKey, explicitCloseKey, setShow]);
}
