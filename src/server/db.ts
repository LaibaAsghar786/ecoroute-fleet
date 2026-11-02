/**
 * EcoRoute Fleet - In-Memory Database and Persistent State Store
 * Pre-seeded with prototype v5 dataset and full CRUD operations
 */

import {
  Truck,
  Trip,
  RouteEvent,
  FuelLog,
  Alert,
  HashChainBlock,
  VehicleProfile,
  CompanySettings,
  DayRecord,
} from '../types';
import { GENESIS_HASH, computeBlockHash } from './hashchain';
import { calculateCo2FromFuel, calculateCredits, calculateFuelFromCo2 } from './emission';

// Initial Seed Trucks from Appendix A
const SEED_TRUCKS: Truck[] = [
  {
    id: 'TRUCK_PK_094',
    model: 'Hino 500',
    plate: 'TK-5021',
    driver: 'Bilal Ahmed',
    driverId: 'PK-094',
    status: 'Active',
    distanceKm: 468,
    co2TodayKg: 412,
    cargoKg: 3500,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 6000,
    lastSync: '2 min ago',
    odometerKm: 83422,
    lat: 25.39,
    lon: 68.37,
    currentSpeed: 58,
  },
  {
    id: 'TRUCK_PK_031',
    model: 'Isuzu F-Series',
    plate: 'TK-3118',
    driver: 'Imran Shah',
    status: 'Active',
    distanceKm: 500,
    co2TodayKg: 520,
    cargoKg: 2800,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 8000,
    lastSync: '4 min ago',
    odometerKm: 112450,
    lat: 26.25,
    lon: 68.41,
    currentSpeed: 64,
  },
  {
    id: 'TRUCK_PK_108',
    model: 'Hino 300',
    plate: 'TK-8108',
    driver: 'Usman Ali',
    status: 'Active',
    distanceKm: 460,
    co2TodayKg: 480,
    cargoKg: 3000,
    integrity: 'Check needed',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 7000,
    lastSync: '8 min ago',
    odometerKm: 64120,
    lat: 27.70,
    lon: 68.86,
    currentSpeed: 45,
  },
  {
    id: 'TRUCK_PK_052',
    model: 'Hyundai Mighty',
    plate: 'TK-5204',
    driver: 'Naveed Khan',
    status: 'Offline',
    distanceKm: 0,
    co2TodayKg: 0,
    cargoKg: 1800,
    integrity: 'Pending',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 3000,
    lastSync: '12 min ago',
    odometerKm: 42100,
    lat: 24.86,
    lon: 67.01,
    currentSpeed: 0,
  },
  {
    id: 'TRUCK_PK_076',
    model: 'Isuzu F-Series',
    plate: 'TK-7610',
    driver: 'Shahid Hussain',
    status: 'Active',
    distanceKm: 420,
    co2TodayKg: 440,
    cargoKg: 2500,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 6500,
    lastSync: '3 min ago',
    odometerKm: 95300,
    lat: 30.16,
    lon: 71.52,
    currentSpeed: 60,
  },
  {
    id: 'TRUCK_PK_021',
    model: 'Hino 500',
    plate: 'TK-2109',
    driver: 'Kashif Raza',
    status: 'Active',
    distanceKm: 480,
    co2TodayKg: 500,
    cargoKg: 3100,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 7500,
    lastSync: '1 min ago',
    odometerKm: 134200,
    lat: 31.55,
    lon: 74.34,
    currentSpeed: 52,
  },
  {
    id: 'TRUCK_PK_064',
    model: 'Mitsubishi Fuso',
    plate: 'TK-6401',
    driver: 'Sajid Ali',
    status: 'Active',
    distanceKm: 500,
    co2TodayKg: 560,
    cargoKg: 2200,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 7000,
    lastSync: '5 min ago',
    odometerKm: 78900,
    lat: 33.68,
    lon: 73.05,
    currentSpeed: 55,
  },
  {
    id: 'TRUCK_PK_011',
    model: 'Hino 300',
    plate: 'TK-1102',
    driver: 'Asif Memon',
    status: 'Idle',
    distanceKm: 122,
    co2TodayKg: 208,
    cargoKg: 0,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 4000,
    lastSync: '6 min ago',
    odometerKm: 51200,
    lat: 24.95,
    lon: 67.12,
    currentSpeed: 0,
  },
];

// Seed Fuel Logs
const SEED_FUEL_LOGS: FuelLog[] = [
  {
    id: 'FL-101',
    truckId: 'TRUCK_PK_094',
    driverId: 'PK-094',
    driverName: 'Bilal Ahmed',
    dateTime: '2026-10-12T07:15:00.000Z',
    litres: 120.5,
    odometerKm: 83120,
    cost: 32535,
    status: 'synced',
  },
  {
    id: 'FL-102',
    truckId: 'TRUCK_PK_031',
    driverId: 'PK-031',
    driverName: 'Imran Shah',
    dateTime: '2026-10-12T08:30:00.000Z',
    litres: 145.0,
    odometerKm: 112100,
    cost: 39150,
    status: 'synced',
  },
  {
    id: 'FL-103',
    truckId: 'TRUCK_PK_076',
    driverId: 'PK-076',
    driverName: 'Shahid Hussain',
    dateTime: '2026-10-11T16:45:00.000Z',
    litres: 110.0,
    odometerKm: 94800,
    cost: 29700,
    status: 'synced',
  },
];

// Seed Alerts
const SEED_ALERTS: Alert[] = [
  {
    id: 'ALT-1',
    type: 'Early warning',
    title: 'Slow traffic likely ahead near the bypass',
    truckId: 'TRUCK_PK_094',
    driverName: 'Bilal Ahmed',
    time: '10:42',
    severity: 'Medium',
    read: false,
  },
  {
    id: 'ALT-2',
    type: 'Idling',
    title: 'Idling over 10 minutes',
    truckId: 'TRUCK_PK_011',
    driverName: 'Asif Memon',
    time: '09:15',
    severity: 'Medium',
    read: false,
  },
  {
    id: 'ALT-3',
    type: 'Offline',
    title: 'Truck offline for 12 min',
    truckId: 'TRUCK_PK_052',
    driverName: 'Naveed Khan',
    time: '08:50',
    severity: 'Low',
    read: false,
  },
  {
    id: 'ALT-4',
    type: 'Integrity',
    title: 'Integrity check needed',
    truckId: 'TRUCK_PK_108',
    driverName: 'Usman Ali',
    time: '08:15',
    severity: 'High',
    read: false,
  },
  {
    id: 'ALT-5',
    type: 'Early warning',
    title: 'Early warning: bottleneck ahead',
    truckId: 'TRUCK_PK_031',
    driverName: 'Imran Shah',
    time: '07:40',
    severity: 'Medium',
    read: false,
  },
];

// Seed Route Events (Eco-routing savings)
const SEED_ROUTE_EVENTS: RouteEvent[] = [
  {
    id: 'RE-1',
    date: '12 Oct',
    truckId: 'TRUCK_PK_094',
    trigger: 'Early warning',
    location: 'Hala Bypass',
    originalKm: 18.4,
    originalMin: 31,
    originalL: 7.2,
    originalCo2Kg: 19.3,
    ecoKm: 19.1,
    ecoMin: 20,
    ecoL: 1.2,
    ecoCo2Kg: 3.2,
    savedCo2Kg: 16.1,
    savedDieselL: 6.0,
    savedTimeMin: 11,
    accepted: true,
  },
  {
    id: 'RE-2',
    date: '12 Oct',
    truckId: 'TRUCK_PK_031',
    trigger: 'Early warning',
    location: 'M-9 Hyderabad Exit',
    originalKm: 24.0,
    originalMin: 38,
    originalL: 8.8,
    originalCo2Kg: 23.5,
    ecoKm: 22.5,
    ecoMin: 29,
    ecoL: 4.3,
    ecoCo2Kg: 11.5,
    savedCo2Kg: 12.0,
    savedDieselL: 4.5,
    savedTimeMin: 9,
    accepted: true,
  },
  {
    id: 'RE-3',
    date: '12 Oct',
    truckId: 'TRUCK_PK_108',
    trigger: 'Idle',
    location: 'Sukkur Toll Plaza',
    originalKm: 15.0,
    originalMin: 25,
    originalL: 5.5,
    originalCo2Kg: 14.7,
    ecoKm: 16.2,
    ecoMin: 19,
    ecoL: 2.1,
    ecoCo2Kg: 5.6,
    savedCo2Kg: 9.1,
    savedDieselL: 3.4,
    savedTimeMin: 6,
    accepted: false,
  },
];

// Build real SHA-256 hash chain for TRUCK_PK_108
function buildInitialHashChain(): HashChainBlock[] {
  const blocks: HashChainBlock[] = [];
  let prevHash = GENESIS_HASH;

  const baseBlocks = [
    { seq: 1038, ts: '2026-10-12T07:45:00Z', speed: 62.1, rpm: 1850, fuelLph: 24.0, load: 68, cool: 84, cargo: 3000, idle: 0, fuelMl: 66000, co2G: 176880 },
    { seq: 1039, ts: '2026-10-12T07:55:00Z', speed: 58.4, rpm: 1780, fuelLph: 22.8, load: 65, cool: 85, cargo: 3000, idle: 0, fuelMl: 63000, co2G: 168840 },
    { seq: 1040, ts: '2026-10-12T08:05:00Z', speed: 64.0, rpm: 1920, fuelLph: 25.1, load: 72, cool: 86, cargo: 3000, idle: 0, fuelMl: 69000, co2G: 184920 },
    { seq: 1041, ts: '2026-10-12T08:15:00Z', speed: 45.2, rpm: 1540, fuelLph: 19.5, load: 58, cool: 87, cargo: 3000, idle: 0, fuelMl: 54000, co2G: 144720 },
    { seq: 1042, ts: '2026-10-12T08:25:00Z', speed: 52.0, rpm: 1680, fuelLph: 21.0, load: 62, cool: 85, cargo: 3000, idle: 0, fuelMl: 58000, co2G: 155440 },
  ];

  for (let i = 0; i < baseBlocks.length; i++) {
    const item = baseBlocks[i];
    const recordData = {
      truckId: 'TRUCK_PK_108',
      tripId: 'TRIP_SUK_041',
      seq: item.seq,
      ts: item.ts,
      speedKmh: item.speed,
      rpm: item.rpm,
      fuelRateLph: item.fuelLph,
      engineLoadPct: item.load,
      coolantC: item.cool,
      cargoKg: item.cargo,
      idle: item.idle,
      fuelMl: item.fuelMl,
      co2G: item.co2G,
    };

    let computed = computeBlockHash(prevHash, recordData);

    // In prototype, #1041 is marked "Check needed" to demonstrate tamper detection
    let status: 'Verified' | 'Pending' | 'Check needed' = 'Verified';
    if (item.seq === 1041) {
      status = 'Check needed';
      // Tamper simulation: record was altered after hash was signed
      recordData.cargoKg = 4500; // tampered!
    } else if (item.seq === 1042) {
      status = 'Pending';
    }

    blocks.push({
      seq: item.seq,
      prevHash,
      hash: computed,
      status,
      timestamp: item.ts,
      recordData,
    });

    prevHash = computed;
  }

  return blocks;
}

// In-Memory Database Store Class
class EcoRouteDatabase {
  public trucks: Truck[] = [];
  public fuelLogs: FuelLog[] = [];
  public alerts: Alert[] = [];
  public routeEvents: RouteEvent[] = [];
  public hashChain: HashChainBlock[] = [];
  public vehicleProfiles: VehicleProfile[] = [];
  public settings!: CompanySettings;

  constructor() {
    this.resetToDefaults();
  }

  public resetToDefaults() {
    this.trucks = JSON.parse(JSON.stringify(SEED_TRUCKS));
    this.fuelLogs = JSON.parse(JSON.stringify(SEED_FUEL_LOGS));
    this.alerts = JSON.parse(JSON.stringify(SEED_ALERTS));
    this.routeEvents = JSON.parse(JSON.stringify(SEED_ROUTE_EVENTS));
    this.hashChain = buildInitialHashChain();

    this.vehicleProfiles = [
      {
        id: 'VP-1',
        name: 'Hino 500 (Diesel)',
        type: 'Fuel',
        efficiencyValue: 30,
        efficiencyUnit: 'L/100 km',
        fuelType: 'Diesel',
        active: true,
        co2PerKmKg: 0.804,
      },
      {
        id: 'VP-2',
        name: 'Isuzu Hybrid',
        type: 'Hybrid',
        efficiencyValue: 22,
        efficiencyUnit: 'L/100 km',
        fuelType: 'Hybrid',
        active: false,
        co2PerKmKg: 0.59,
      },
      {
        id: 'VP-3',
        name: 'Eco EV Van',
        type: 'EV',
        efficiencyValue: 38,
        efficiencyUnit: 'kWh/100 km',
        fuelType: 'EV',
        active: false,
        co2PerKmKg: 0.0,
      },
    ];

    this.settings = {
      companyName: 'AJ Logistics',
      managerName: 'Laiba Asghar',
      managerEmail: 'laiba.asghar@ecoroute.com',
      monthlyAllowanceTotalKg: 100000, // 100 credits
      idleAlertMinutes: 10,
      dailyCo2TargetPerTruckKg: 450,
      earlyWarningSensitivity: 'Normal',
      fuelVarianceThresholdPct: 15,
      units: 'km_L_kg',
      language: 'en-GB',
    };
  }

  // Monthly day-by-day generator for a truck (October 1 to 12)
  public getTruckDays(truckId: string): DayRecord[] {
    const truck = this.trucks.find((t) => t.id === truckId) || this.trucks[0];
    const truckIdx = this.trucks.findIndex((t) => t.id === truckId);
    const records: DayRecord[] = [];

    // Deterministic pseudo-random seed generator from prototype
    for (let d = 12; d >= 1; d--) {
      let co2 = 0;
      let co2Saved = 0;
      let distance = Math.round(truck.distanceKm * (0.85 + 0.3 * (((truckIdx + 1) * 977 + d * 131) % 100) / 100));

      if (d === 12) {
        co2 = truck.co2TodayKg;
        co2Saved = truckIdx === 0 ? 38 : 16;
      } else {
        co2 = Math.round(truck.co2TodayKg * (0.88 + 0.25 * (((truckIdx + 2) * 811 + d * 97) % 100) / 100));
        co2Saved = Math.round(co2 * 0.08);
      }

      const dieselL = Math.round(co2 / 2.68);
      const dieselSavedL = Number((co2Saved / 2.68).toFixed(1));
      const timeSavedMin = Math.round(dieselSavedL * 1.8);

      records.push({
        day: d,
        date: `2026-10-${String(d).padStart(2, '0')}`,
        co2Kg: co2,
        credits: calculateCredits(co2),
        dieselL,
        distanceKm: distance,
        co2SavedKg: co2Saved,
        dieselSavedL,
        timeSavedMin,
        cargoKg: truck.cargoKg,
        idleMin: d === 12 ? 42 : Math.round(30 + (d * 5) % 25),
        integrity: d === 9 && truck.id === 'TRUCK_PK_108' ? 'Check needed' : 'Verified',
      });
    }

    return records;
  }

  // Monthly summary stats for a truck
  public getTruckMonthlySummary(truckId: string) {
    const days = this.getTruckDays(truckId);
    const totalCo2 = days.reduce((acc, cur) => acc + cur.co2Kg, 0);
    const totalDiesel = days.reduce((acc, cur) => acc + cur.dieselL, 0);
    const totalDistance = days.reduce((acc, cur) => acc + cur.distanceKm, 0);
    const totalSavedCo2 = days.reduce((acc, cur) => acc + cur.co2SavedKg, 0);
    const totalSavedDiesel = days.reduce((acc, cur) => acc + cur.dieselSavedL, 0);
    const totalSavedTime = days.reduce((acc, cur) => acc + cur.timeSavedMin, 0);

    return {
      totalCo2Kg: totalCo2,
      totalCredits: calculateCredits(totalCo2),
      totalDieselL: totalDiesel,
      totalDistanceKm: totalDistance,
      totalSavedCo2Kg: totalSavedCo2,
      totalSavedDieselL: Number(totalSavedDiesel.toFixed(1)),
      totalSavedTimeMin: totalSavedTime,
      activeDays: days.length,
      days,
    };
  }

  // Fleet overview KPIs
  public getFleetSummary() {
    const totalCo2Today = this.trucks.reduce((acc, t) => acc + t.co2TodayKg, 0);
    const totalDieselToday = Math.round(totalCo2Today / 2.68);
    const totalDistanceToday = this.trucks.reduce((acc, t) => acc + t.distanceKm, 0);
    const totalCargoTonnes = Number(
      (this.trucks.reduce((acc, t) => acc + (t.status === 'Active' ? t.cargoKg : 0), 0) / 1000).toFixed(1)
    );
    const activeCount = this.trucks.filter((t) => t.status === 'Active').length;
    const idleCount = this.trucks.filter((t) => t.status === 'Idle').length;
    const offlineCount = this.trucks.filter((t) => t.status === 'Offline').length;

    // Monthly cumulative calculation
    let mtdCo2 = 0;
    this.trucks.forEach((t) => {
      const summary = this.getTruckMonthlySummary(t.id);
      mtdCo2 += summary.totalCo2Kg;
    });

    const creditsToday = calculateCredits(totalCo2Today);
    const creditsMtd = calculateCredits(mtdCo2);
    const allowanceKg = this.settings.monthlyAllowanceTotalKg;
    const allowanceCredits = calculateCredits(allowanceKg);
    const creditsRemaining = Math.max(0, Number((allowanceCredits - creditsMtd).toFixed(2)));

    // Cumulative savings
    const savedCo2Today = this.routeEvents.reduce((acc, r) => acc + (r.accepted ? r.savedCo2Kg : 0), 0) + 142;
    const savedDieselToday = Number((savedCo2Today / 2.68).toFixed(1));

    return {
      co2TodayKg: totalCo2Today,
      creditsToday,
      dieselTodayL: totalDieselToday,
      distanceTodayKm: totalDistanceToday,
      cargoMovedTonnes: totalCargoTonnes,
      activeTrucks: activeCount,
      idleTrucks: idleCount,
      offlineTrucks: offlineCount,
      totalTrucks: this.trucks.length,
      creditsMtd,
      allowanceCredits,
      creditsRemaining,
      savedCo2TodayKg: Math.round(savedCo2Today),
      savedDieselTodayL: savedDieselToday,
      savedTimeTodayText: '1 h 35 m',
      earlyWarningsToday: 6,
      acceptedReroutesToday: 4 + this.routeEvents.filter((r) => r.accepted).length,
    };
  }
}

export const db = new EcoRouteDatabase();
