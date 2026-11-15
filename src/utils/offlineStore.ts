/**
 * EcoRoute Fleet - Persistent Offline Outbox, Response Cache & Preferences Store
 * Uses IndexedDB (with localStorage fallback) so queued writes and cached reads survive page refreshes.
 * Records are removed from the outbox ONLY after confirmed 2xx server acknowledgment.
 */

export interface OutboxItem {
  id: string;
  endpoint: '/api/fuel-logs' | '/api/route-events';
  payload: Record<string, any>;
  createdAt: string;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

export interface UiPreferences {
  isDark?: boolean;
  currentView?: string;
  selectedTruckId?: string;
  selectedDay?: number;
}

const DB_NAME = 'ecoroute_offline_db';
const DB_VERSION = 1;
const STORE_OUTBOX = 'outbox';
const OUTBOX_LS_KEY = 'ecoroute_outbox_fallback_v1';
const CACHE_LS_PREFIX = 'ecoroute_api_cache_v1:';
const PREFS_LS_KEY = 'ecoroute_ui_prefs_v1';

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readLocalStorageOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_LS_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocalStorageOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(OUTBOX_LS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export const OfflineStore = {
  async listOutbox(): Promise<OutboxItem[]> {
    const idb = await openIdb();
    if (!idb) return readLocalStorageOutbox();

    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(STORE_OUTBOX, 'readonly');
        const store = tx.objectStore(STORE_OUTBOX);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as OutboxItem[]) || []);
        req.onerror = () => resolve(readLocalStorageOutbox());
      } catch {
        resolve(readLocalStorageOutbox());
      }
    });
  },

  async enqueueOutbox(
    endpoint: OutboxItem['endpoint'],
    payload: Record<string, any>,
    lastError?: string
  ): Promise<OutboxItem> {
    const item: OutboxItem = {
      id: `OBX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endpoint,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 1,
      nextRetryAt: Date.now() + 5000,
      lastError,
    };

    const idb = await openIdb();
    if (idb) {
      await new Promise<void>((resolve) => {
        try {
          const tx = idb.transaction(STORE_OUTBOX, 'readwrite');
          tx.objectStore(STORE_OUTBOX).put(item);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } else {
      const current = readLocalStorageOutbox();
      current.push(item);
      writeLocalStorageOutbox(current);
    }
    return item;
  },

  async updateOutboxItem(updated: OutboxItem): Promise<void> {
    const idb = await openIdb();
    if (idb) {
      await new Promise<void>((resolve) => {
        try {
          const tx = idb.transaction(STORE_OUTBOX, 'readwrite');
          tx.objectStore(STORE_OUTBOX).put(updated);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } else {
      const current = readLocalStorageOutbox().map((i) => (i.id === updated.id ? updated : i));
      writeLocalStorageOutbox(current);
    }
  },

  async removeOutboxItem(id: string): Promise<void> {
    const idb = await openIdb();
    if (idb) {
      await new Promise<void>((resolve) => {
        try {
          const tx = idb.transaction(STORE_OUTBOX, 'readwrite');
          tx.objectStore(STORE_OUTBOX).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } else {
      const filtered = readLocalStorageOutbox().filter((i) => i.id !== id);
      writeLocalStorageOutbox(filtered);
    }
  },

  saveApiCache<T>(key: string, data: T): void {
    try {
      localStorage.setItem(
        `${CACHE_LS_PREFIX}${key}`,
        JSON.stringify({ savedAt: new Date().toISOString(), data })
      );
    } catch {
      // ignore storage quota errors
    }
  },

  loadApiCache<T>(key: string): { data: T; savedAt: string } | null {
    try {
      const raw = localStorage.getItem(`${CACHE_LS_PREFIX}${key}`);
      if (!raw) return null;
      return JSON.parse(raw) as { data: T; savedAt: string };
    } catch {
      return null;
    }
  },

  loadPrefs(): UiPreferences {
    try {
      const raw = localStorage.getItem(PREFS_LS_KEY);
      return raw ? (JSON.parse(raw) as UiPreferences) : {};
    } catch {
      return {};
    }
  },

  savePrefs(partial: UiPreferences): void {
    try {
      const next = { ...OfflineStore.loadPrefs(), ...partial };
      localStorage.setItem(PREFS_LS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  },
};
