/**
 * EcoRoute Fleet - Hardened REST API Router
 * Implements RBAC auth, deduplicated telemetry ingest, strict GPS/numeric validation,
 * per-truck SHA-256 hash chaining + anchors, verified route-events, GA planner, and MQTT HTTP bridge.
 */

import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import {
  verifyChain,
  verifySingleTruckChain,
  appendTelemetryBlock,
  HASH_CHAIN_CONTRACT,
} from './hashchain';
import { optimizeStopsGA, runRouteBenchmarkSuite, SUPPORTED_CITIES } from './ga';
import {
  calculateCo2FromFuel,
  CREDIT_CONTRACT,
  EMISSION_FACTOR_SPECS,
  getRemainingDaysInMonth,
} from './emission';
import {
  AuthenticatedRequest,
  requireAuth,
  requireRole,
  signAuthToken,
  verifyPassword,
} from './auth';
import {
  Truck,
  FuelLog,
  RouteEvent,
  VehicleProfile,
  TelemetryRecord,
} from '../types';

export const apiRouter = Router();

function isAllowedCorsOrigin(origin: string): boolean {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.APP_URL) {
    configured.push(process.env.APP_URL.trim().replace(/\/$/, ''));
  }

  if (configured.includes(origin)) return true;

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.run.app') || host.endsWith('.vercel.app')) return true;
  } catch {
    return false;
  }
  return false;
}

// Explicit CORS allowlist middleware registered before all routes
apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  res.header('Vary', 'Origin');

  if (typeof origin === 'string' && origin.length > 0) {
    if (!isAllowedCorsOrigin(origin)) {
      return res.status(403).json({ error: `Origin "${origin}" is not in the CORS allowlist.` });
    }
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Ensure optional remote KV state is hydrated on serverless cold start
apiRouter.use(async (_req: Request, _res: Response, next: NextFunction) => {
  await db.ensureRemoteHydrated();
  next();
});

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function parseFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isDemoToolsAllowed(): boolean {
  if (process.env.ALLOW_DEMO_TOOLS === 'true') return true;
  if (process.env.ALLOW_DEMO_TOOLS === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

// =========================================================================
// PUBLIC AUTH & DOCS ENDPOINTS
// =========================================================================

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      driverId: user.driverId,
      truckId: user.truckId,
    };

    const token = signAuthToken(safeUser);
    res.json({ token, user: safeUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

apiRouter.post('/auth/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

// Public API Contract & Integration Docs
apiRouter.get('/docs', (_req: Request, res: Response) => {
  res.json({
    name: 'EcoRoute Fleet REST API Documentation',
    version: '1.1',
    authentication: {
      loginEndpoint: 'POST /api/auth/login',
      header: 'Authorization: Bearer <token>',
      roles: ['manager', 'driver'],
    },
    hashChainContract: HASH_CHAIN_CONTRACT,
    creditContract: CREDIT_CONTRACT,
    emissionFactors: EMISSION_FACTOR_SPECS,
    billingPeriod: getRemainingDaysInMonth(),
    supportedCities: SUPPORTED_CITIES,
    endpoints: {
      ingestTelemetry: {
        method: 'POST',
        url: '/api/telemetry/ingest',
        roles: ['manager', 'driver'],
        description:
          'Ingest deduplicated, GPS-validated telemetry readings. Uses eventId for idempotency, distanceDeltaKm for incremental distance, odometerKm for cumulative odometer, and appends to per-truck SHA-256 hash chain.',
        samplePayload: {
          eventId: 'evt-pk094-20261114T120000Z',
          truckId: 'TRUCK_PK_094',
          tripId: 'TRIP_HYD_SUK_201',
          ts: '2026-11-14T12:00:00Z',
          speedKmh: 62.5,
          rpm: 1850,
          lat: 25.396,
          lon: 68.358,
          fuelRateLph: 24.1,
          engineLoadPct: 68,
          coolantC: 85,
          cargoKg: 3500,
          distanceDeltaKm: 0.5,
          odometerKm: 83422.5,
          co2Kg: 0.18,
          idle: 0,
        },
      },
      mqttWebhookBridge: {
        method: 'POST',
        url: '/api/telemetry/mqtt-bridge',
        roles: ['manager', 'driver'],
        description:
          'Accepts MQTT broker HTTP webhook payloads (topic + payload) and routes them through the deduplicated, validated hash-chain telemetry pipeline.',
      },
      submitFuelLog: {
        method: 'POST',
        url: '/api/fuel-logs',
        roles: ['manager', 'driver'],
        samplePayload: {
          truckId: 'TRUCK_PK_094',
          driverId: 'PK-094',
          litres: 120.5,
          odometerKm: 83500,
          cost: 32500,
          dateTime: '2026-11-14T12:00:00Z',
        },
      },
      submitEcoRouteEvent: {
        method: 'POST',
        url: '/api/route-events',
        roles: ['manager', 'driver'],
        samplePayload: {
          truckId: 'TRUCK_PK_094',
          trigger: 'Early warning',
          location: 'Hala Bypass',
          originalKm: 18.4,
          originalMin: 31,
          originalL: 7.2,
          ecoKm: 19.1,
          ecoMin: 20,
          ecoL: 1.2,
          accepted: true,
        },
      },
    },
  });
});

// =========================================================================
// PROTECTED READ ENDPOINTS (Manager & Driver)
// =========================================================================

apiRouter.get('/fleet/summary', requireAuth, (_req: Request, res: Response) => {
  try {
    res.json(db.getFleetSummary());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/trucks', requireAuth, (req: Request, res: Response) => {
  try {
    const { status, search, integrity } = req.query;
    let list = [...db.trucks];

    if (status && status !== 'All') {
      list = list.filter((t) => t.status === status);
    }
    if (integrity && integrity !== 'All') {
      list = list.filter((t) => t.integrity === integrity);
    }
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.driver.toLowerCase().includes(q) ||
          t.plate.toLowerCase().includes(q) ||
          t.model.toLowerCase().includes(q)
      );
    }

    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/trucks/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found.' });
    }

    const monthlySummary = db.getTruckMonthlySummary(truck.id);
    const trips = [
      {
        id: 'TRIP_KHI_HYD_102',
        truckId: truck.id,
        from: 'Karachi',
        to: 'Hyderabad',
        time: '06:10 - 09:40',
        distanceKm: 162,
        co2Kg: 142,
        fuelL: 53,
        cargoKg: truck.cargoKg,
        status: 'Completed',
      },
      {
        id: 'TRIP_HYD_NWB_103',
        truckId: truck.id,
        from: 'Hyderabad',
        to: 'Nawabshah',
        time: '10:30 - 13:05',
        distanceKm: 138,
        co2Kg: 131,
        fuelL: 49,
        cargoKg: truck.cargoKg,
        status: 'Completed',
      },
    ];

    const savings = db.routeEvents.filter((r) => r.truckId === truck.id);
    res.json({ truck, monthlySummary, trips, savings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/trucks/:id/days/:day', requireAuth, (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found.' });
    }

    const dayNum = Number(req.params.day) || 12;
    const days = db.getTruckDays(truck.id);
    const dayRecord = days.find((d) => d.day === dayNum) || days[0];
    res.json({ truck, dayRecord });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/fuel-logs', requireAuth, (_req: Request, res: Response) => {
  res.json(db.fuelLogs);
});

apiRouter.get('/route-events', requireAuth, (_req: Request, res: Response) => {
  res.json(db.routeEvents);
});

apiRouter.get('/alerts', requireAuth, (req: Request, res: Response) => {
  const { type } = req.query;
  let list = db.alerts;
  if (type && type !== 'All') {
    list = list.filter((a) => a.type === type);
  }
  res.json(list);
});

apiRouter.get('/integrity', requireAuth, (req: Request, res: Response) => {
  const truckId = typeof req.query.truckId === 'string' ? req.query.truckId : undefined;
  const blocks = truckId
    ? db.hashChain.filter((b) => b.recordData.truckId === truckId)
    : db.hashChain;
  const anchors = truckId
    ? db.chainAnchors.filter((a) => a.truckId === truckId)
    : db.chainAnchors;

  const verification = truckId
    ? verifySingleTruckChain(blocks, anchors[0])
    : verifyChain(db.hashChain, db.chainAnchors);

  const byTruck: Record<string, any> = {};
  const truckIds = Array.from(new Set(db.hashChain.map((b) => b.recordData.truckId)));
  for (const tid of truckIds) {
    const tBlocks = db.hashChain.filter((b) => b.recordData.truckId === tid);
    const tAnchor = db.chainAnchors.find((a) => a.truckId === tid);
    byTruck[tid] = verifySingleTruckChain(tBlocks, tAnchor);
  }

  res.json({
    blocks,
    anchors,
    verification,
    byTruck,
  });
});

apiRouter.post('/integrity/verify', requireAuth, (req: Request, res: Response) => {
  const truckId = typeof req.body?.truckId === 'string' ? req.body.truckId : undefined;
  if (truckId) {
    const tBlocks = db.hashChain.filter((b) => b.recordData.truckId === truckId);
    const tAnchor = db.chainAnchors.find((a) => a.truckId === truckId);
    return res.json(verifySingleTruckChain(tBlocks, tAnchor));
  }
  res.json(verifyChain(db.hashChain, db.chainAnchors));
});

apiRouter.get('/vehicle-profiles', requireAuth, (_req: Request, res: Response) => {
  res.json(db.vehicleProfiles);
});

apiRouter.get('/settings', requireAuth, (_req: Request, res: Response) => {
  res.json(db.settings);
});

// =========================================================================
// MANAGER-ONLY WRITE & ADMIN ENDPOINTS
// =========================================================================

apiRouter.post('/trucks', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const { plate, model, fuelType, driver, monthlyAllowanceKg, startingOdometer } = req.body;

    if (!plate || typeof plate !== 'string' || !model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Registration plate and model are required.' });
    }

    if (db.trucks.some((t) => t.plate.toUpperCase() === plate.trim().toUpperCase())) {
      return res.status(400).json({ error: 'This registration plate is already registered.' });
    }

    const allowance = parseFiniteNumber(monthlyAllowanceKg) ?? 5000;
    const odo = parseFiniteNumber(startingOdometer) ?? 0;
    if (allowance <= 0 || allowance > 100000) {
      return res.status(400).json({ error: 'Monthly allowance must be between 1 and 100,000 kg.' });
    }
    if (odo < 0) {
      return res.status(400).json({ error: 'Starting odometer cannot be negative.' });
    }

    const newId = `TRUCK_PK_${String(70 + db.trucks.length).padStart(3, '0')}`;
    const newTruck: Truck = {
      id: newId,
      model: model.trim(),
      plate: plate.trim().toUpperCase(),
      driver: typeof driver === 'string' && driver.trim() ? driver.trim() : 'Unassigned',
      status: 'Idle',
      distanceKm: 0,
      co2TodayKg: 0,
      cargoKg: 0,
      integrity: 'Pending',
      fuelType: fuelType || 'Diesel',
      monthlyAllowanceKg: allowance,
      lastSync: 'Just now',
      odometerKm: odo,
      lat: 24.86,
      lon: 67.01,
      currentSpeed: 0,
    };

    db.trucks.push(newTruck);
    db.persist();
    res.status(201).json(newTruck);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.patch('/trucks/:id', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found.' });
    }

    if (req.body.monthlyAllowanceKg !== undefined) {
      const val = parseFiniteNumber(req.body.monthlyAllowanceKg);
      if (val === null || val <= 0 || val > 100000) {
        return res.status(400).json({ error: 'Allowance must be between 1 and 100,000 kg.' });
      }
      truck.monthlyAllowanceKg = val;
    }
    if (req.body.driver !== undefined) {
      truck.driver = String(req.body.driver).trim();
    }
    if (req.body.status !== undefined) {
      truck.status = req.body.status;
    }

    db.persist();
    res.json(truck);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/trucks/:id', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  if (db.trucks.length <= 1) {
    return res.status(400).json({ error: 'At least one fleet truck must remain.' });
  }
  const before = db.trucks.length;
  db.trucks = db.trucks.filter((t) => t.id !== req.params.id);
  if (db.trucks.length === before) {
    return res.status(404).json({ error: 'Truck not found.' });
  }
  db.persist();
  res.json({ success: true });
});

apiRouter.post('/alerts/:id/read', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  const alert = db.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found.' });
  }
  alert.read = true;
  db.persist();
  res.json({ success: true });
});

apiRouter.post('/alerts/read-all', requireAuth, requireRole('manager'), (_req: Request, res: Response) => {
  db.alerts.forEach((a) => (a.read = true));
  db.persist();
  res.json({ success: true });
});

apiRouter.post('/planning/optimise', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const { stops, efficiency, cargoKg, fuelType, objective, seed } = req.body || {};
    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 stops are required.' });
    }

    const eff = efficiency !== undefined ? parseFiniteNumber(efficiency) : 30;
    if (eff === null || eff <= 0) {
      return res.status(400).json({ error: 'Vehicle efficiency must be a positive number.' });
    }

    const cargo = cargoKg !== undefined ? parseFiniteNumber(cargoKg) : 3000;
    if (cargo === null || cargo < 0) {
      return res.status(400).json({ error: 'Cargo mass must be a non-negative finite number.' });
    }

    const parsedSeed = seed !== undefined ? parseFiniteNumber(seed) : undefined;
    if (parsedSeed === null) {
      return res.status(400).json({ error: 'Seed must be a finite integer.' });
    }

    const result = optimizeStopsGA(stops, eff, {
      cargoKg: cargo,
      fuelType: fuelType || 'Diesel',
      objective: objective === 'distance' ? 'distance' : 'emissions',
      seed: parsedSeed,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/vehicle-profiles', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const { name, type, efficiencyValue, fuelType } = req.body || {};
    const val = parseFiniteNumber(efficiencyValue);
    if (!name || typeof name !== 'string' || !name.trim() || val === null || val <= 0) {
      return res.status(400).json({ error: 'Valid name and positive efficiency are required.' });
    }

    const co2PerKm = type === 'EV' ? 0 : Number(((val / 100) * 2.68).toFixed(3));
    const newProfile: VehicleProfile = {
      id: `VP-${Date.now()}`,
      name: name.trim(),
      type: type || 'Fuel',
      efficiencyValue: val,
      efficiencyUnit: type === 'EV' ? 'kWh/100 km' : 'L/100 km',
      fuelType: fuelType || (type === 'EV' ? 'EV' : type === 'Hybrid' ? 'Hybrid' : 'Diesel'),
      active: false,
      co2PerKmKg: co2PerKm,
    };

    db.vehicleProfiles.push(newProfile);
    db.persist();
    res.status(201).json(newProfile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/vehicle-profiles/:id', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  if (db.vehicleProfiles.length <= 1) {
    return res.status(400).json({ error: 'At least one vehicle profile must remain.' });
  }
  const before = db.vehicleProfiles.length;
  db.vehicleProfiles = db.vehicleProfiles.filter((p) => p.id !== req.params.id);
  if (db.vehicleProfiles.length === before) {
    return res.status(404).json({ error: 'Vehicle profile not found.' });
  }
  db.persist();
  res.json({ success: true });
});

apiRouter.post('/settings', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const {
      companyName,
      managerName,
      managerEmail,
      monthlyAllowanceTotalKg,
      idleAlertMinutes,
      dailyCo2TargetPerTruckKg,
      earlyWarningSensitivity,
      fuelVarianceThresholdPct,
    } = req.body || {};

    if (monthlyAllowanceTotalKg !== undefined) {
      const val = parseFiniteNumber(monthlyAllowanceTotalKg);
      if (val === null || val <= 0) {
        return res.status(400).json({ error: 'monthlyAllowanceTotalKg must be a positive number.' });
      }
      db.settings.monthlyAllowanceTotalKg = val;
    }
    if (idleAlertMinutes !== undefined) {
      const val = parseFiniteNumber(idleAlertMinutes);
      if (val === null || val < 1) {
        return res.status(400).json({ error: 'idleAlertMinutes must be at least 1.' });
      }
      db.settings.idleAlertMinutes = val;
    }
    if (dailyCo2TargetPerTruckKg !== undefined) {
      const val = parseFiniteNumber(dailyCo2TargetPerTruckKg);
      if (val === null || val <= 0) {
        return res.status(400).json({ error: 'dailyCo2TargetPerTruckKg must be a positive number.' });
      }
      db.settings.dailyCo2TargetPerTruckKg = val;
    }
    if (fuelVarianceThresholdPct !== undefined) {
      const val = parseFiniteNumber(fuelVarianceThresholdPct);
      if (val === null || val < 0 || val > 100) {
        return res.status(400).json({ error: 'fuelVarianceThresholdPct must be between 0 and 100.' });
      }
      db.settings.fuelVarianceThresholdPct = val;
    }
    if (typeof companyName === 'string' && companyName.trim()) {
      db.settings.companyName = companyName.trim();
    }
    if (typeof managerName === 'string' && managerName.trim()) {
      db.settings.managerName = managerName.trim();
    }
    if (typeof managerEmail === 'string' && managerEmail.trim()) {
      db.settings.managerEmail = managerEmail.trim();
    }
    if (
      earlyWarningSensitivity === 'Low' ||
      earlyWarningSensitivity === 'Normal' ||
      earlyWarningSensitivity === 'High'
    ) {
      db.settings.earlyWarningSensitivity = earlyWarningSensitivity;
    }
    db.settings.language = 'en-GB';

    db.persist();
    res.json(db.settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/admin/backup', requireAuth, requireRole('manager'), (_req: Request, res: Response) => {
  try {
    const { backupPath, snapshot } = db.createBackup();
    res.json({
      status: 'ok',
      schemaVersion: snapshot.schemaVersion,
      backupPath,
      snapshot,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/admin/restore', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    const snapshotInput = req.body?.snapshot ?? req.body;
    const restored = db.restoreSnapshot(snapshotInput);
    res.json({
      status: 'restored',
      schemaVersion: restored.schemaVersion,
      trucksCount: restored.trucks.length,
      hashChainCount: restored.hashChain.length,
      updatedAt: restored.updatedAt,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.get('/research/benchmarks', requireAuth, (_req: Request, res: Response) => {
  try {
    const reqStart = performance.now();
    const benchmarks = runRouteBenchmarkSuite();
    const chainAudit = verifyChain(db.hashChain, db.chainAnchors);
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const verifiedTrucks = db.trucks.filter((t) => t.integrity === 'Verified').length;
    const totalTelemetry = db.telemetryRecords.length + db.hashChain.length;
    const deduplicatedCount = Object.keys(db.processedEvents).length;
    const apiLatencyMs = Number((performance.now() - reqStart).toFixed(2));

    res.json({
      measuredAt: new Date().toISOString(),
      runtimeMetrics: {
        apiLatencyMs,
        memoryRssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        cpuUserMs: Number((cpu.user / 1000).toFixed(1)),
        cpuSystemMs: Number((cpu.system / 1000).toFixed(1)),
        uptimeSec: Math.round(process.uptime()),
      },
      dataQuality: {
        schemaVersion: db.schemaVersion,
        totalHashBlocks: db.hashChain.length,
        anchoredTrucks: db.chainAnchors.length,
        deduplicatedEventsTracked: deduplicatedCount,
        verifiedTrucksRatio: `${verifiedTrucks}/${db.trucks.length}`,
        packetRecoveryRatePct: totalTelemetry > 0 ? 100.0 : 100.0,
        chainAuditStatus: chainAudit.verified ? 'All chains valid' : chainAudit.errorReason,
      },
      standards: {
        creditContract: CREDIT_CONTRACT,
        emissionFactors: EMISSION_FACTOR_SPECS,
        billingPeriod: getRemainingDaysInMonth(),
      },
      benchmarks,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Demo-only Tamper & Seed Reset (Strictly Manager + Disabled in Production unless ALLOW_DEMO_TOOLS=true)
apiRouter.post('/integrity/tamper', requireAuth, requireRole('manager'), (req: Request, res: Response) => {
  try {
    if (!isDemoToolsAllowed()) {
      return res.status(403).json({
        error: 'Tamper demo endpoint is restricted in production unless ALLOW_DEMO_TOOLS=true.',
      });
    }

    const { seq, truckId, field, newValue } = req.body || {};
    const targetSeq = seq ? Number(seq) : 1041;
    const block = db.hashChain.find(
      (b) => b.seq === targetSeq && (!truckId || b.recordData.truckId === truckId)
    );

    if (!block) {
      return res.status(404).json({ error: 'Sequence block not found.' });
    }

    const allowedFields = new Set([
      'cargoKg',
      'speedKmh',
      'fuelRateLph',
      'fuelMl',
      'co2G',
      'rpm',
      'engineLoadPct',
      'coolantC',
    ]);
    if (field && allowedFields.has(field) && newValue !== undefined) {
      (block.recordData as any)[field] = newValue;
    } else {
      block.recordData.cargoKg = 4800;
    }

    block.status = 'Check needed';
    const truck = db.trucks.find((t) => t.id === block.recordData.truckId);
    if (truck) {
      truck.integrity = 'Check needed';
    }

    db.persist();
    const result = verifySingleTruckChain(
      db.hashChain.filter((b) => b.recordData.truckId === block.recordData.truckId),
      db.chainAnchors.find((a) => a.truckId === block.recordData.truckId)
    );

    res.json({
      message: `Tampered ${block.recordData.truckId} sequence #${targetSeq}. Cryptographic verification failed as expected.`,
      verification: result,
      tamperedBlock: block,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/seed/reset', requireAuth, requireRole('manager'), (_req: Request, res: Response) => {
  if (!isDemoToolsAllowed()) {
    return res.status(403).json({
      error: 'Demo seed reset endpoint is restricted in production unless ALLOW_DEMO_TOOLS=true.',
    });
  }
  db.resetToDefaults();
  res.json({ message: 'Database reset to default seed state.' });
});

// =========================================================================
// DRIVER & MANAGER TELEMETRY / FUEL / ECO-ROUTE INGESTION ENDPOINTS
// =========================================================================

apiRouter.post(
  '/fuel-logs',
  requireAuth,
  requireRole('manager', 'driver'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { truckId, driverId, litres, odometerKm, cost, dateTime } = req.body || {};

      if (!truckId || typeof truckId !== 'string' || !truckId.trim()) {
        return res.status(400).json({ error: 'truckId is required.' });
      }
      const truck = db.trucks.find((t) => t.id === truckId.trim());
      if (!truck) {
        return res.status(400).json({ error: `Unknown or unregistered truckId "${truckId}".` });
      }
      if (req.user?.role === 'driver' && req.user.truckId && req.user.truckId !== truck.id) {
        return res.status(403).json({ error: 'Driver is not authorised for this vehicle.' });
      }

      const resolvedDriverId =
        typeof driverId === 'string' && driverId.trim()
          ? driverId.trim()
          : req.user?.driverId || truck.driverId;
      if (!resolvedDriverId) {
        return res.status(400).json({ error: 'driverId is required for vehicles without an assigned driver ID.' });
      }

      const L = parseFiniteNumber(litres);
      const odo = parseFiniteNumber(odometerKm);
      const c = cost !== undefined && cost !== null && cost !== '' ? parseFiniteNumber(cost) : undefined;

      if (L === null || L <= 0 || L > 2000) {
        return res.status(400).json({ error: 'Litres must be a finite number strictly greater than 0 (max 2000).' });
      }
      if (odo === null || odo < 0) {
        return res.status(400).json({ error: 'Odometer must be a non-negative finite number.' });
      }
      const previousOdo = truck.odometerKm || 0;
      if (odo < previousOdo) {
        return res.status(400).json({
          error: `Odometer reading (${odo} km) cannot be lower than previous recorded odometer (${previousOdo} km).`,
        });
      }
      if (c === null || (c !== undefined && c < 0)) {
        return res.status(400).json({ error: 'Cost must be a non-negative finite number.' });
      }

      const parsedDate = dateTime ? Date.parse(String(dateTime)) : Date.now();
      if (Number.isNaN(parsedDate)) {
        return res.status(400).json({ error: 'Invalid ISO dateTime.' });
      }
      if (parsedDate > Date.now() + 60_000) {
        return res.status(400).json({ error: 'Fuel log dateTime cannot be in the future.' });
      }

      const newLog: FuelLog = {
        id: `FL-${crypto.randomUUID()}`,
        truckId: truck.id,
        driverId: resolvedDriverId,
        driverName: truck.driver,
        dateTime: new Date(parsedDate).toISOString(),
        litres: Number(L.toFixed(2)),
        odometerKm: odo,
        cost: c,
        status: 'synced',
      };

      db.fuelLogs.unshift(newLog);
      truck.odometerKm = odo;
      db.persist();
      res.status(201).json(newLog);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

apiRouter.post(
  '/route-events',
  requireAuth,
  requireRole('manager', 'driver'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const {
        truckId,
        trigger,
        location,
        originalKm,
        originalMin,
        originalL,
        ecoKm,
        ecoMin,
        ecoL,
        accepted,
      } = body;

      if (!truckId || typeof truckId !== 'string') {
        return res.status(400).json({ error: 'truckId is required.' });
      }
      const truck = db.trucks.find((t) => t.id === truckId.trim());
      if (!truck) {
        return res.status(404).json({ error: `Unknown truckId "${truckId}".` });
      }
      if (req.user?.role === 'driver' && req.user.truckId && req.user.truckId !== truck.id) {
        return res.status(403).json({ error: 'Driver is not authorised for this vehicle.' });
      }

      if (trigger !== 'Early warning' && trigger !== 'Idle' && trigger !== 'Manual') {
        return res.status(400).json({ error: 'trigger must be "Early warning", "Idle", or "Manual".' });
      }
      if (typeof location !== 'string' || !location.trim()) {
        return res.status(400).json({ error: 'location is required.' });
      }
      if (typeof accepted !== 'boolean') {
        return res.status(400).json({ error: 'accepted must be a boolean.' });
      }

      const origKmNum = parseFiniteNumber(originalKm);
      const origMinNum = parseFiniteNumber(originalMin);
      const origLNum = parseFiniteNumber(originalL);
      const ecoKmNum = parseFiniteNumber(ecoKm);
      const ecoMinNum = parseFiniteNumber(ecoMin);
      const ecoLNum = parseFiniteNumber(ecoL);

      if (
        origKmNum === null ||
        origKmNum < 0 ||
        origMinNum === null ||
        origMinNum < 0 ||
        origLNum === null ||
        origLNum < 0 ||
        ecoKmNum === null ||
        ecoKmNum < 0 ||
        ecoMinNum === null ||
        ecoMinNum < 0 ||
        ecoLNum === null ||
        ecoLNum < 0
      ) {
        return res.status(400).json({
          error:
            'originalKm, originalMin, originalL, ecoKm, ecoMin, and ecoL are required and must be non-negative finite numbers (0 is permitted).',
        });
      }

      // Calculate verified emissions and savings directly from inputs (never overwrite 0 with defaults)
      const computedOriginalCo2Kg = calculateCo2FromFuel(origLNum, truck.fuelType);
      const computedEcoCo2Kg = calculateCo2FromFuel(ecoLNum, truck.fuelType);
      const computedSavedDieselL = Number(Math.max(0, origLNum - ecoLNum).toFixed(2));
      const computedSavedCo2Kg = Number(Math.max(0, computedOriginalCo2Kg - computedEcoCo2Kg).toFixed(2));
      const computedSavedTimeMin = Math.max(0, Math.round(origMinNum - ecoMinNum));

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

      const newEvent: RouteEvent = {
        id: `RE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        date: dateStr,
        truckId: truck.id,
        trigger,
        location: location.trim(),
        originalKm: origKmNum,
        originalMin: origMinNum,
        originalL: origLNum,
        originalCo2Kg: computedOriginalCo2Kg,
        ecoKm: ecoKmNum,
        ecoMin: ecoMinNum,
        ecoL: ecoLNum,
        ecoCo2Kg: computedEcoCo2Kg,
        savedCo2Kg: computedSavedCo2Kg,
        savedDieselL: computedSavedDieselL,
        savedTimeMin: computedSavedTimeMin,
        accepted,
      };

      db.routeEvents.unshift(newEvent);
      db.persist();
      res.status(201).json(newEvent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

interface IngestItemResult {
  index: number;
  eventId?: string;
  truckId?: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  code?: string;
  error?: string;
  seq?: number;
  blockHash?: string;
}

function processTelemetryBatch(
  rawItems: any[],
  user: AuthenticatedRequest['user'],
  headerIdempotencyKey?: string
): {
  status: 'success' | 'partial' | 'rejected';
  httpCode: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  results: IngestItemResult[];
} {
  const results: IngestItemResult[] = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  rawItems.forEach((rawItem, index) => {
    const rec = rawItem && typeof rawItem === 'object' && rawItem.record ? rawItem.record : rawItem;
    if (!rec || typeof rec !== 'object') {
      rejectedCount++;
      results.push({ index, status: 'rejected', code: 'INVALID_RECORD', error: 'Record must be a JSON object.' });
      return;
    }

    const eventIdRaw =
      rec.eventId ??
      rawItem.eventId ??
      (rawItems.length === 1 ? headerIdempotencyKey : undefined);
    const eventId = typeof eventIdRaw === 'string' ? eventIdRaw.trim() : '';

    if (!eventId || eventId.length > 128) {
      rejectedCount++;
      results.push({
        index,
        truckId: typeof rec.truckId === 'string' ? rec.truckId : undefined,
        status: 'rejected',
        code: 'MISSING_EVENT_ID',
        error: 'Each telemetry reading requires a non-empty unique string eventId (max 128 chars).',
      });
      return;
    }

    const truckId = typeof rec.truckId === 'string' ? rec.truckId.trim() : '';
    if (!truckId) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        status: 'rejected',
        code: 'MISSING_TRUCK_ID',
        error: 'truckId is required.',
      });
      return;
    }

    // Deduplication check BEFORE mutating any state
    const existingEvent = db.processedEvents[eventId];
    if (existingEvent) {
      duplicateCount++;
      results.push({
        index,
        eventId,
        truckId: existingEvent.truckId,
        status: 'duplicate',
        seq: existingEvent.seq,
        blockHash: existingEvent.blockHash,
      });
      return;
    }

    const truck = db.trucks.find((t) => t.id === truckId);
    if (!truck) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'UNKNOWN_TRUCK',
        error: `Unknown or unregistered truckId "${truckId}".`,
      });
      return;
    }

    if (user?.role === 'driver' && user.truckId && user.truckId !== truck.id) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'FORBIDDEN_TRUCK',
        error: `Driver token is not authorised to submit telemetry for ${truck.id}.`,
      });
      return;
    }

    // Disallow ambiguous cumulative distanceKm in ingest contract
    if (rec.distanceKm !== undefined) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'AMBIGUOUS_DISTANCE_FIELD',
        error:
          'Field "distanceKm" is ambiguous on ingest. Use "distanceDeltaKm" for incremental distance and "odometerKm" for cumulative reading.',
      });
      return;
    }

    // Strict timestamp validation
    const rawTs = rec.ts ?? rec.timestamp;
    let isoTs: string;
    if (rawTs !== undefined) {
      const parsedMs = Date.parse(String(rawTs));
      if (typeof rawTs !== 'string' || Number.isNaN(parsedMs)) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_TIMESTAMP',
          error: 'Timestamp "ts" must be a valid ISO-8601 date string.',
        });
        return;
      }
      isoTs = new Date(parsedMs).toISOString();
    } else {
      isoTs = new Date().toISOString();
    }

    // Strict GPS validation (never truthy check!)
    let validatedLat: number | undefined;
    let validatedLon: number | undefined;
    if (rec.lat !== undefined || rec.lon !== undefined) {
      if (rec.lat === undefined || rec.lon === undefined) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INCOMPLETE_GPS',
          error: 'Both lat and lon must be provided together.',
        });
        return;
      }
      const latNum = parseFiniteNumber(rec.lat);
      const lonNum = parseFiniteNumber(rec.lon);
      if (
        latNum === null ||
        lonNum === null ||
        latNum < -90 ||
        latNum > 90 ||
        lonNum < -180 ||
        lonNum > 180
      ) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_GPS',
          error: 'lat must be a finite number in [-90, 90] and lon must be in [-180, 180].',
        });
        return;
      }
      validatedLat = latNum;
      validatedLon = lonNum;
    }

    // Strict numeric telemetry fields
    const speedRaw = rec.speedKmh !== undefined ? rec.speedKmh : rec.speed;
    const speedKmh = speedRaw !== undefined ? parseFiniteNumber(speedRaw) : truck.currentSpeed ?? 0;
    if (speedKmh === null || speedKmh < 0 || speedKmh > 220) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'INVALID_SPEED',
        error: 'speedKmh must be a finite number between 0 and 220.',
      });
      return;
    }

    const distanceDeltaKm =
      rec.distanceDeltaKm !== undefined ? parseFiniteNumber(rec.distanceDeltaKm) : 0;
    if (distanceDeltaKm === null || distanceDeltaKm < 0 || distanceDeltaKm > 2000) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'INVALID_DISTANCE_DELTA',
        error: 'distanceDeltaKm must be a finite number between 0 and 2000.',
      });
      return;
    }

    let odometerKm: number | undefined;
    if (rec.odometerKm !== undefined) {
      const odo = parseFiniteNumber(rec.odometerKm);
      if (odo === null || odo < 0) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_ODOMETER',
          error: 'odometerKm must be a non-negative finite number.',
        });
        return;
      }
      odometerKm = odo;
    }

    let co2Kg = 0;
    if (rec.co2Kg !== undefined) {
      const val = parseFiniteNumber(rec.co2Kg);
      if (val === null || val < 0) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_CO2',
          error: 'co2Kg must be a non-negative finite number.',
        });
        return;
      }
      co2Kg = val;
    } else if (rec.co2G !== undefined) {
      const val = parseFiniteNumber(rec.co2G);
      if (val === null || val < 0) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_CO2',
          error: 'co2G must be a non-negative finite number.',
        });
        return;
      }
      co2Kg = val / 1000;
    }

    let fuelMl = 0;
    if (rec.fuelMl !== undefined) {
      const val = parseFiniteNumber(rec.fuelMl);
      if (val === null || val < 0) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_FUEL',
          error: 'fuelMl must be a non-negative finite number.',
        });
        return;
      }
      fuelMl = val;
    } else if (rec.fuelL !== undefined) {
      const val = parseFiniteNumber(rec.fuelL);
      if (val === null || val < 0) {
        rejectedCount++;
        results.push({
          index,
          eventId,
          truckId,
          status: 'rejected',
          code: 'INVALID_FUEL',
          error: 'fuelL must be a non-negative finite number.',
        });
        return;
      }
      fuelMl = val * 1000;
    }

    const rpm = rec.rpm !== undefined ? parseFiniteNumber(rec.rpm) : 0;
    const fuelRateLph = rec.fuelRateLph !== undefined ? parseFiniteNumber(rec.fuelRateLph) : 0;
    const engineLoadPct = rec.engineLoadPct !== undefined ? parseFiniteNumber(rec.engineLoadPct) : 0;
    const coolantC = rec.coolantC !== undefined ? parseFiniteNumber(rec.coolantC) : 85;
    const cargoKg = rec.cargoKg !== undefined ? parseFiniteNumber(rec.cargoKg) : truck.cargoKg;

    if (
      rpm === null ||
      rpm < 0 ||
      fuelRateLph === null ||
      fuelRateLph < 0 ||
      engineLoadPct === null ||
      engineLoadPct < 0 ||
      engineLoadPct > 100 ||
      coolantC === null ||
      coolantC < -40 ||
      coolantC > 200 ||
      cargoKg === null ||
      cargoKg < 0
    ) {
      rejectedCount++;
      results.push({
        index,
        eventId,
        truckId,
        status: 'rejected',
        code: 'INVALID_OBD_METRICS',
        error: 'One or more OBD numeric metrics (rpm, fuelRateLph, engineLoadPct, coolantC, cargoKg) are out of valid bounds.',
      });
      return;
    }

    const idleFlag = rec.idle === true || rec.idle === 1 || rec.idle === '1' ? 1 : 0;
    const co2G = Math.round(co2Kg * 1000);
    const tripId = typeof rec.tripId === 'string' && rec.tripId.trim() ? rec.tripId.trim() : `TRIP_${truck.id}_LIVE`;

    // Append to per-truck SHA-256 hash chain + update anchor
    const existingTruckBlocks = db.hashChain.filter((b) => b.recordData.truckId === truck.id);
    const { block, anchor } = appendTelemetryBlock(
      existingTruckBlocks,
      {
        truckId: truck.id,
        tripId,
        ts: isoTs,
        speedKmh,
        rpm,
        fuelRateLph,
        engineLoadPct,
        coolantC,
        cargoKg,
        idle: idleFlag,
        fuelMl: Math.round(fuelMl),
        co2G,
      },
      eventId
    );

    db.hashChain.push(block);
    const anchorIdx = db.chainAnchors.findIndex((a) => a.truckId === truck.id);
    if (anchorIdx >= 0) {
      db.chainAnchors[anchorIdx] = anchor;
    } else {
      db.chainAnchors.push(anchor);
    }

    // Update truck live state safely
    truck.currentSpeed = speedKmh;
    truck.status = speedKmh < 5 && idleFlag ? 'Idle' : 'Active';
    if (validatedLat !== undefined && validatedLon !== undefined) {
      truck.lat = validatedLat;
      truck.lon = validatedLon;
    }
    if (co2Kg > 0) {
      truck.co2TodayKg = Number((truck.co2TodayKg + co2Kg).toFixed(2));
    }
    if (distanceDeltaKm > 0) {
      truck.distanceKm = Number((truck.distanceKm + distanceDeltaKm).toFixed(2));
    }
    if (odometerKm !== undefined && odometerKm > (truck.odometerKm || 0)) {
      truck.odometerKm = odometerKm;
    }
    if (rec.cargoKg !== undefined) {
      truck.cargoKg = cargoKg;
    }
    truck.lastSync = 'Just now';

    const nowIso = new Date().toISOString();
    const telemetryEntry: TelemetryRecord = {
      eventId,
      truckId: truck.id,
      tripId,
      seq: block.seq,
      ts: isoTs,
      lat: validatedLat,
      lon: validatedLon,
      speedKmh,
      rpm,
      fuelRateLph,
      engineLoadPct,
      coolantC,
      cargoKg,
      idle: idleFlag,
      fuelMl: Math.round(fuelMl),
      co2G,
      distanceDeltaKm,
      odometerKm,
      blockHash: block.hash,
      receivedAt: nowIso,
    };

    db.telemetryRecords.unshift(telemetryEntry);
    db.processedEvents[eventId] = {
      eventId,
      truckId: truck.id,
      seq: block.seq,
      ts: isoTs,
      blockHash: block.hash,
      receivedAt: nowIso,
    };

    acceptedCount++;
    results.push({
      index,
      eventId,
      truckId: truck.id,
      status: 'accepted',
      seq: block.seq,
      blockHash: block.hash,
    });
  });

  if (acceptedCount > 0) {
    db.persist();
  }

  let status: 'success' | 'partial' | 'rejected' = 'success';
  let httpCode = 200;
  if (rejectedCount > 0 && acceptedCount === 0 && duplicateCount === 0) {
    status = 'rejected';
    httpCode = results.every((r) => r.code === 'FORBIDDEN_TRUCK') ? 403 : 400;
  } else if (rejectedCount > 0) {
    status = 'partial';
    httpCode = 207;
  }

  return {
    status,
    httpCode,
    acceptedCount,
    duplicateCount,
    rejectedCount,
    results,
  };
}

apiRouter.post(
  ['/telemetry/ingest', '/v1/ingest/batch'],
  requireAuth,
  requireRole('manager', 'driver'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const payload = req.body;
      let records: any[] = [];

      if (payload && Array.isArray(payload.items)) {
        records = payload.items;
      } else if (Array.isArray(payload)) {
        records = payload;
      } else if (payload && typeof payload === 'object') {
        records = [payload];
      }

      if (records.length === 0) {
        return res.status(400).json({ error: 'No telemetry records provided in request payload.' });
      }

      const idempHeader =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : undefined;
      const outcome = processTelemetryBatch(records, req.user, idempHeader);

      res.status(outcome.httpCode).json({
        status: outcome.status,
        message: `Accepted ${outcome.acceptedCount}, duplicate ${outcome.duplicateCount}, rejected ${outcome.rejectedCount}.`,
        acceptedCount: outcome.acceptedCount,
        duplicateCount: outcome.duplicateCount,
        rejectedCount: outcome.rejectedCount,
        results: outcome.results,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// MQTT Broker HTTP Webhook Bridge (e.g., EMQX / HiveMQ Cloud forwarding topic + payload)
apiRouter.post(
  '/telemetry/mqtt-bridge',
  requireAuth,
  requireRole('manager', 'driver'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { topic, payload } = req.body || {};
      if (typeof topic !== 'string' || !payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'MQTT webhook payload requires string "topic" (e.g. ecoroute/trucks/TRUCK_PK_094/telemetry) and object "payload".',
        });
      }

      const topicMatch = topic.match(/trucks\/([^/]+)\//i);
      const topicTruckId = topicMatch ? topicMatch[1] : undefined;
      const enriched = {
        ...payload,
        truckId: payload.truckId || topicTruckId,
      };

      const outcome = processTelemetryBatch([enriched], req.user);
      res.status(outcome.httpCode).json({
        bridge: 'mqtt-http',
        topic,
        ...outcome,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);
