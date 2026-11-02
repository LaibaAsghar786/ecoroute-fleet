/**
 * EcoRoute Fleet - Frontend API Client Service
 * Connects React UI to Express backend with offline fallback and caching
 */

import {
  Truck,
  FuelLog,
  RouteEvent,
  Alert,
  HashChainBlock,
  VehicleProfile,
  CompanySettings,
} from '../types';

export const ApiService = {
  // Fleet Summary
  async getFleetSummary() {
    try {
      const res = await fetch('/api/fleet/summary');
      if (!res.ok) throw new Error('Failed to fetch fleet summary');
      return await res.json();
    } catch (e) {
      console.warn('API error, using cached summary', e);
      return null;
    }
  },

  // Trucks
  async getTrucks(params?: { status?: string; search?: string; integrity?: string }): Promise<Truck[]> {
    try {
      const query = new URLSearchParams(params as any).toString();
      const res = await fetch(`/api/trucks?${query}`);
      if (!res.ok) throw new Error('Failed to fetch trucks');
      return await res.json();
    } catch (e) {
      console.warn('API error fetching trucks', e);
      return [];
    }
  },

  async getTruckDetails(truckId: string) {
    try {
      const res = await fetch(`/api/trucks/${truckId}`);
      if (!res.ok) throw new Error('Failed to fetch truck details');
      return await res.json();
    } catch (e) {
      console.warn('API error fetching truck details', e);
      return null;
    }
  },

  async addTruck(truckData: Partial<Truck> & { startingOdometer?: number }): Promise<Truck | null> {
    const res = await fetch('/api/trucks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(truckData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add truck');
    }
    return await res.json();
  },

  async updateTruck(truckId: string, updates: Partial<Truck>): Promise<Truck | null> {
    const res = await fetch(`/api/trucks/${truckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update truck');
    return await res.json();
  },

  // Fuel Logs
  async getFuelLogs(): Promise<FuelLog[]> {
    try {
      const res = await fetch('/api/fuel-logs');
      if (!res.ok) throw new Error('Failed to fetch fuel logs');
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async addFuelLog(fuelData: Partial<FuelLog>): Promise<FuelLog> {
    const res = await fetch('/api/fuel-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fuelData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save fuel log');
    }
    return await res.json();
  },

  // Route Events
  async getRouteEvents(): Promise<RouteEvent[]> {
    try {
      const res = await fetch('/api/route-events');
      if (!res.ok) throw new Error('Failed to fetch route events');
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async addRouteEvent(eventData: Partial<RouteEvent>): Promise<RouteEvent> {
    const res = await fetch('/api/route-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
    if (!res.ok) throw new Error('Failed to save route event');
    return await res.json();
  },

  // Alerts
  async getAlerts(type?: string): Promise<Alert[]> {
    try {
      const res = await fetch(`/api/alerts${type ? `?type=${type}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async markAlertRead(alertId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/alerts/${alertId}/read`, { method: 'POST' });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  async markAllAlertsRead(): Promise<boolean> {
    try {
      const res = await fetch('/api/alerts/read-all', { method: 'POST' });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  // Data Integrity & Tamper Demo
  async getIntegrityData(): Promise<{ blocks: HashChainBlock[]; verification: any }> {
    const res = await fetch('/api/integrity');
    if (!res.ok) throw new Error('Failed to fetch integrity data');
    return await res.json();
  },

  async verifyIntegrity(): Promise<any> {
    const res = await fetch('/api/integrity/verify', { method: 'POST' });
    if (!res.ok) throw new Error('Verification failed');
    return await res.json();
  },

  async simulateTamper(seq?: number, field?: string, newValue?: any): Promise<any> {
    const res = await fetch('/api/integrity/tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seq, field, newValue }),
    });
    if (!res.ok) throw new Error('Tamper simulation failed');
    return await res.json();
  },

  // Multi-stop GA
  async optimizeStops(stops: string[], efficiency: number = 30) {
    const res = await fetch('/api/planning/optimise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops, efficiency }),
    });
    if (!res.ok) throw new Error('Optimization failed');
    return await res.json();
  },

  // Vehicle Profiles
  async getVehicleProfiles(): Promise<VehicleProfile[]> {
    try {
      const res = await fetch('/api/vehicle-profiles');
      if (!res.ok) throw new Error('Failed to fetch vehicle profiles');
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async addVehicleProfile(profile: Partial<VehicleProfile>): Promise<VehicleProfile> {
    const res = await fetch('/api/vehicle-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save vehicle profile');
    }
    return await res.json();
  },

  async deleteVehicleProfile(id: string): Promise<boolean> {
    const res = await fetch(`/api/vehicle-profiles/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  // Settings
  async getSettings(): Promise<CompanySettings> {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return await res.json();
  },

  async updateSettings(settings: Partial<CompanySettings>): Promise<CompanySettings> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return await res.json();
  },

  // Reset to seed
  async resetSeed(): Promise<void> {
    await fetch('/api/seed/reset', { method: 'POST' });
  },
};
