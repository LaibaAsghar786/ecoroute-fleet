/**
 * EcoRoute Fleet - Frontend API Client Service
 * Handles JWT bearer authentication, persistent response caching on network failure,
 * and acknowledgment-safe IndexedDB outbox retry for queued writes.
 */

import {
  AuthUser,
  Truck,
  FuelLog,
  RouteEvent,
  Alert,
  HashChainBlock,
  ChainAnchor,
  VehicleProfile,
  CompanySettings,
} from '../types';
import { OfflineStore } from '../utils/offlineStore';

const TOKEN_STORAGE_KEY = 'ecoroute_auth_token';
let inMemoryToken: string | null = null;

export interface CacheSyncState {
  isUsingCachedData: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let syncState: CacheSyncState = {
  isUsingCachedData: false,
  lastSyncedAt: null,
  lastError: null,
};

function markLiveSuccess() {
  syncState = {
    isUsingCachedData: false,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };
}

function markCachedFallback(savedAt: string | null, errMsg: string) {
  syncState = {
    isUsingCachedData: true,
    lastSyncedAt: savedAt || syncState.lastSyncedAt,
    lastError: errMsg,
  };
}

function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = ApiService.getToken();
  const headers: Record<string, string> = { ...(extra || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && data.error) return data.error;
  } catch {
    // ignore JSON parse failure
  }
  return fallback;
}

async function fetchJsonWithCache<T>(
  url: string,
  cacheKey: string,
  fallbackValue: T
): Promise<T> {
  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`HTTP ${res.status}`);
      }
      const cached = OfflineStore.loadApiCache<T>(cacheKey);
      if (cached) {
        markCachedFallback(cached.savedAt, `Server returned HTTP ${res.status}; showing cached data.`);
        return cached.data;
      }
      return fallbackValue;
    }
    const data = (await res.json()) as T;
    OfflineStore.saveApiCache(cacheKey, data);
    markLiveSuccess();
    return data;
  } catch (err: any) {
    if (String(err?.message || '').startsWith('HTTP 40')) {
      return fallbackValue;
    }
    const cached = OfflineStore.loadApiCache<T>(cacheKey);
    if (cached) {
      markCachedFallback(cached.savedAt, 'Network unavailable; showing last cached snapshot.');
      return cached.data;
    }
    markCachedFallback(null, 'Network unavailable and no cached snapshot is stored yet.');
    return fallbackValue;
  }
}

export const ApiService = {
  getSyncState(): CacheSyncState {
    return { ...syncState };
  },

  getToken(): string | null {
    if (inMemoryToken) return inMemoryToken;
    try {
      const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) inMemoryToken = stored;
      return stored;
    } catch {
      return null;
    }
  },

  setToken(token: string | null) {
    inMemoryToken = token;
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  },

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Sign in failed.'));
    }
    const data = await res.json();
    ApiService.setToken(data.token);
    markLiveSuccess();
    return data;
  },

  async verifySession(): Promise<AuthUser | null> {
    const token = ApiService.getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) ApiService.setToken(null);
        return null;
      }
      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } finally {
      ApiService.setToken(null);
    }
  },

  async getFleetSummary() {
    return fetchJsonWithCache('/api/fleet/summary', 'fleet_summary', null);
  },

  async getTrucks(params?: { status?: string; search?: string; integrity?: string }): Promise<Truck[]> {
    const query = params ? new URLSearchParams(params as any).toString() : '';
    const cacheKey = query ? `trucks:${query}` : 'trucks';
    return fetchJsonWithCache<Truck[]>(`/api/trucks${query ? `?${query}` : ''}`, cacheKey, []);
  },

  async getTruckDetails(truckId: string) {
    return fetchJsonWithCache(`/api/trucks/${truckId}`, `truck_details:${truckId}`, null);
  },

  async addTruck(truckData: Partial<Truck> & { startingOdometer?: number }): Promise<Truck | null> {
    const res = await fetch('/api/trucks', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(truckData),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to add truck.'));
    }
    return await res.json();
  },

  async updateTruck(truckId: string, updates: Partial<Truck>): Promise<Truck | null> {
    const res = await fetch(`/api/trucks/${truckId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to update truck.'));
    }
    return await res.json();
  },

  async deleteTruck(truckId: string): Promise<boolean> {
    const res = await fetch(`/api/trucks/${truckId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to delete truck.'));
    }
    return true;
  },

  async getFuelLogs(): Promise<FuelLog[]> {
    return fetchJsonWithCache<FuelLog[]>('/api/fuel-logs', 'fuel_logs', []);
  },

  async addFuelLog(fuelData: Partial<FuelLog>): Promise<FuelLog & { queued?: boolean }> {
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(fuelData),
      });
      if (!res.ok) {
        if (res.status >= 500) {
          await OfflineStore.enqueueOutbox('/api/fuel-logs', fuelData as Record<string, any>, `HTTP ${res.status}`);
          return { ...(fuelData as FuelLog), id: `QUEUED-${Date.now()}`, status: 'pending', queued: true };
        }
        throw new Error(await parseError(res, 'Failed to save fuel log.'));
      }
      return await res.json();
    } catch (err: any) {
      if (err instanceof TypeError) {
        await OfflineStore.enqueueOutbox('/api/fuel-logs', fuelData as Record<string, any>, 'Network offline');
        return { ...(fuelData as FuelLog), id: `QUEUED-${Date.now()}`, status: 'pending', queued: true };
      }
      throw err;
    }
  },

  async getRouteEvents(): Promise<RouteEvent[]> {
    return fetchJsonWithCache<RouteEvent[]>('/api/route-events', 'route_events', []);
  },

  async addRouteEvent(eventData: Partial<RouteEvent>): Promise<RouteEvent & { queued?: boolean }> {
    try {
      const res = await fetch('/api/route-events', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(eventData),
      });
      if (!res.ok) {
        if (res.status >= 500) {
          await OfflineStore.enqueueOutbox('/api/route-events', eventData as Record<string, any>, `HTTP ${res.status}`);
          return { ...(eventData as RouteEvent), id: `QUEUED-${Date.now()}`, queued: true };
        }
        throw new Error(await parseError(res, 'Failed to save route event.'));
      }
      return await res.json();
    } catch (err: any) {
      if (err instanceof TypeError) {
        await OfflineStore.enqueueOutbox('/api/route-events', eventData as Record<string, any>, 'Network offline');
        return { ...(eventData as RouteEvent), id: `QUEUED-${Date.now()}`, queued: true };
      }
      throw err;
    }
  },

  /**
   * Flushes persisted offline outbox records with exponential backoff.
   * Items are deleted ONLY after a confirmed 2xx server acknowledgment.
   */
  async flushOutbox(forceRetryAll: boolean = false): Promise<{
    syncedCount: number;
    remainingCount: number;
  }> {
    if (!ApiService.getToken()) {
      const existing = await OfflineStore.listOutbox();
      return { syncedCount: 0, remainingCount: existing.length };
    }

    const items = await OfflineStore.listOutbox();
    let syncedCount = 0;
    const now = Date.now();

    for (const item of items) {
      if (!forceRetryAll && item.nextRetryAt > now) continue;
      try {
        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await OfflineStore.removeOutboxItem(item.id);
          syncedCount++;
        } else {
          const msg = await parseError(res, `HTTP ${res.status}`);
          const nextAttempts = item.attempts + 1;
          const backoffMs = Math.min(60000, 2000 * Math.pow(2, nextAttempts));
          await OfflineStore.updateOutboxItem({
            ...item,
            attempts: nextAttempts,
            nextRetryAt: Date.now() + backoffMs,
            lastError: msg,
          });
        }
      } catch (err: any) {
        const nextAttempts = item.attempts + 1;
        const backoffMs = Math.min(60000, 2000 * Math.pow(2, nextAttempts));
        await OfflineStore.updateOutboxItem({
          ...item,
          attempts: nextAttempts,
          nextRetryAt: Date.now() + backoffMs,
          lastError: err?.message || 'Network unreachable',
        });
      }
    }

    const remaining = await OfflineStore.listOutbox();
    return { syncedCount, remainingCount: remaining.length };
  },

  async getAlerts(type?: string): Promise<Alert[]> {
    return fetchJsonWithCache<Alert[]>(
      `/api/alerts${type ? `?type=${type}` : ''}`,
      type ? `alerts:${type}` : 'alerts',
      []
    );
  },

  async markAlertRead(alertId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/alerts/${alertId}/read`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async markAllAlertsRead(): Promise<boolean> {
    try {
      const res = await fetch('/api/alerts/read-all', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async getIntegrityData(): Promise<{
    blocks: HashChainBlock[];
    anchors: ChainAnchor[];
    verification: any;
    byTruck: Record<string, any>;
  } | null> {
    return fetchJsonWithCache('/api/integrity', 'integrity', null);
  },

  async verifyIntegrity(truckId?: string): Promise<any> {
    const res = await fetch('/api/integrity/verify', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(truckId ? { truckId } : {}),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Verification failed.'));
    }
    return await res.json();
  },

  async simulateTamper(seq?: number, field?: string, newValue?: any): Promise<any> {
    const res = await fetch('/api/integrity/tamper', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ seq, field, newValue }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Tamper demonstration failed.'));
    }
    return await res.json();
  },

  async sendTestTelemetry(payload: Record<string, any>): Promise<any> {
    const res = await fetch('/api/telemetry/ingest', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Telemetry ingest failed.'));
    }
    return await res.json();
  },

  async optimizeStops(
    stops: string[],
    efficiency: number = 30,
    cargoKg: number = 3000,
    objective: 'emissions' | 'distance' = 'emissions',
    seed?: number
  ) {
    const res = await fetch('/api/planning/optimise', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stops, efficiency, cargoKg, objective, seed }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Route optimisation failed.'));
    }
    return await res.json();
  },

  async getResearchBenchmarks(): Promise<any> {
    return fetchJsonWithCache('/api/research/benchmarks', 'research_benchmarks', null);
  },

  async getVehicleProfiles(): Promise<VehicleProfile[]> {
    return fetchJsonWithCache<VehicleProfile[]>('/api/vehicle-profiles', 'vehicle_profiles', []);
  },

  async addVehicleProfile(profile: Partial<VehicleProfile>): Promise<VehicleProfile> {
    const res = await fetch('/api/vehicle-profiles', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to save vehicle profile.'));
    }
    return await res.json();
  },

  async deleteVehicleProfile(id: string): Promise<boolean> {
    const res = await fetch(`/api/vehicle-profiles/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  },

  async getSettings(): Promise<CompanySettings | null> {
    return fetchJsonWithCache('/api/settings', 'settings', null);
  },

  async updateSettings(settings: Partial<CompanySettings>): Promise<CompanySettings> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to update settings.'));
    }
    return await res.json();
  },

  async resetSeed(): Promise<void> {
    const res = await fetch('/api/seed/reset', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Reset seed failed.'));
    }
  },
};
