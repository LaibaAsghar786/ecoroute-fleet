/**
 * EcoRoute Fleet - Frontend API Client Service
 * Handles JWT bearer authentication and all REST calls to the backend.
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

const TOKEN_STORAGE_KEY = 'ecoroute_auth_token';
let inMemoryToken: string | null = null;

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

export const ApiService = {
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
    return data;
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
    try {
      const res = await fetch('/api/fleet/summary', { headers: getAuthHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async getTrucks(params?: { status?: string; search?: string; integrity?: string }): Promise<Truck[]> {
    try {
      const query = params ? new URLSearchParams(params as any).toString() : '';
      const res = await fetch(`/api/trucks${query ? `?${query}` : ''}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async getTruckDetails(truckId: string) {
    try {
      const res = await fetch(`/api/trucks/${truckId}`, { headers: getAuthHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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

  async getFuelLogs(): Promise<FuelLog[]> {
    try {
      const res = await fetch('/api/fuel-logs', { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async addFuelLog(fuelData: Partial<FuelLog>): Promise<FuelLog> {
    const res = await fetch('/api/fuel-logs', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(fuelData),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to save fuel log.'));
    }
    return await res.json();
  },

  async getRouteEvents(): Promise<RouteEvent[]> {
    try {
      const res = await fetch('/api/route-events', { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async addRouteEvent(eventData: Partial<RouteEvent>): Promise<RouteEvent> {
    const res = await fetch('/api/route-events', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(eventData),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Failed to save route event.'));
    }
    return await res.json();
  },

  async getAlerts(type?: string): Promise<Alert[]> {
    try {
      const res = await fetch(`/api/alerts${type ? `?type=${type}` : ''}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
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
    try {
      const res = await fetch('/api/integrity', { headers: getAuthHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
    objective: 'emissions' | 'distance' = 'emissions'
  ) {
    const res = await fetch('/api/planning/optimise', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stops, efficiency, cargoKg, objective }),
    });
    if (!res.ok) {
      throw new Error(await parseError(res, 'Route optimisation failed.'));
    }
    return await res.json();
  },

  async getVehicleProfiles(): Promise<VehicleProfile[]> {
    try {
      const res = await fetch('/api/vehicle-profiles', { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
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
    try {
      const res = await fetch('/api/settings', { headers: getAuthHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
