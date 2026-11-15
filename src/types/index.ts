/**
 * EcoRoute Fleet - Domain Types and Interfaces
 * Technical Build Specification Version 1.1
 */

export type VehicleFuelType = 'Diesel' | 'CNG' | 'Hybrid' | 'EV';
export type TruckStatus = 'Active' | 'Idle' | 'Offline';
export type IntegrityStatus = 'Verified' | 'Pending' | 'Check needed';
export type AlertType = 'Early warning' | 'Idling' | 'Offline' | 'Integrity' | 'High CO2 rate' | 'Allowance';
export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type AllowanceBand = 'On track' | 'Warning' | 'Critical' | 'Exceeded';
export type UserRole = 'manager' | 'driver';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  driverId?: string;
  truckId?: string;
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface Truck {
  id: string;
  model: string;
  plate: string;
  driver: string;
  driverId?: string;
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
  day: number;
  date: string;
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
  id: string;
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

export interface TelemetryRecord {
  eventId: string;
  truckId: string;
  tripId: string;
  seq: number;
  ts: string;
  lat?: number;
  lon?: number;
  speedKmh: number;
  rpm: number;
  fuelRateLph: number;
  engineLoadPct: number;
  coolantC: number;
  cargoKg: number;
  idle: number;
  fuelMl: number;
  co2G: number;
  distanceDeltaKm: number;
  odometerKm?: number;
  blockHash: string;
  receivedAt: string;
}

export interface ProcessedEventRecord {
  eventId: string;
  truckId: string;
  seq: number;
  ts: string;
  blockHash: string;
  receivedAt: string;
}

export interface HashChainBlock {
  seq: number;
  prevHash: string;
  hash: string;
  status: IntegrityStatus;
  timestamp: string;
  eventId?: string;
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

export interface ChainAnchor {
  truckId: string;
  headSeq: number;
  headHash: string;
  blockCount: number;
  anchoredAt: string;
  anchorSignature: string;
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
  language: 'en-GB';
}
