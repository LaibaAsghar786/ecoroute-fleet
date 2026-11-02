/**
 * EcoRoute Fleet - Domain Types and Interfaces
 * Technical Build Specification Version 1.0
 */

export type VehicleFuelType = 'Diesel' | 'CNG' | 'Hybrid' | 'EV';
export type TruckStatus = 'Active' | 'Idle' | 'Offline';
export type IntegrityStatus = 'Verified' | 'Pending' | 'Check needed';
export type AlertType = 'Early warning' | 'Idling' | 'Offline' | 'Integrity' | 'High CO2 rate' | 'Allowance';
export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type AllowanceBand = 'On track' | 'Warning' | 'Critical' | 'Exceeded';

export interface Truck {
  id: string; // e.g. TRUCK_PK_094
  model: string; // e.g. Hino 500
  plate: string; // e.g. TK-5021
  driver: string; // e.g. Bilal Ahmed
  driverId?: string; // e.g. PK-094
  status: TruckStatus;
  distanceKm: number;
  co2TodayKg: number;
  cargoKg: number;
  integrity: IntegrityStatus;
  fuelType: VehicleFuelType;
  monthlyAllowanceKg: number;
  lastSync: string;
  odometerKm?: number;
  lat?: number;
  lon?: number;
  currentSpeed?: number;
}

export interface DayRecord {
  day: number; // 1 to 31
  date: string; // YYYY-MM-DD
  co2Kg: number;
  credits: number;
  dieselL: number;
  distanceKm: number;
  co2SavedKg: number;
  dieselSavedL: number;
  timeSavedMin: number;
  cargoKg: number;
  idleMin: number;
  integrity: IntegrityStatus;
}

export interface Trip {
  id: string; // e.g. TRIP_KHI_HYD_102
  truckId: string;
  from: string;
  to: string;
  time: string;
  distanceKm: number;
  co2Kg: number;
  fuelL: number;
  cargoKg: number;
  status: 'Completed' | 'In Progress';
}

export interface RouteEvent {
  id: string;
  date: string;
  truckId: string;
  trigger: 'Early warning' | 'Idle' | 'Manual';
  location: string;
  originalKm: number;
  originalMin: number;
  originalL: number;
  originalCo2Kg: number;
  ecoKm: number;
  ecoMin: number;
  ecoL: number;
  ecoCo2Kg: number;
  savedCo2Kg: number;
  savedDieselL: number;
  savedTimeMin: number;
  accepted: boolean;
}

export interface FuelLog {
  id: string;
  truckId: string;
  driverId: string;
  driverName?: string;
  dateTime: string;
  litres: number;
  odometerKm: number;
  cost?: number;
  status: 'synced' | 'pending';
}

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  truckId: string;
  driverName: string;
  time: string;
  severity: AlertSeverity;
  read: boolean;
  meta?: Record<string, any>;
}

export interface HashChainBlock {
  seq: number;
  prevHash: string;
  hash: string;
  status: IntegrityStatus;
  timestamp: string;
  recordData: {
    truckId: string;
    tripId: string;
    seq: number;
    ts: string;
    speedKmh: number;
    rpm: number;
    fuelRateLph: number;
    engineLoadPct: number;
    coolantC: number;
    cargoKg: number;
    idle: number;
    fuelMl: number;
    co2G: number;
  };
}

export interface VehicleProfile {
  id: string;
  name: string;
  type: 'Fuel' | 'Hybrid' | 'EV';
  efficiencyValue: number;
  efficiencyUnit: 'L/100 km' | 'kWh/100 km';
  fuelType: VehicleFuelType;
  active: boolean;
  co2PerKmKg: number;
}

export interface CompanySettings {
  companyName: string;
  managerName: string;
  managerEmail: string;
  monthlyAllowanceTotalKg: number;
  idleAlertMinutes: number;
  dailyCo2TargetPerTruckKg: number;
  earlyWarningSensitivity: 'Low' | 'Normal' | 'High';
  fuelVarianceThresholdPct: number;
  units: 'km_L_kg';
  language: string;
}

export interface ObdTelemetry {
  connected: boolean;
  speedKmh: number;
  rpm: number;
  fuelRateL100km: number;
  coolantTempC: number;
  engineLoadPct: number;
  isIdling: boolean;
  engineStandby: boolean;
}
