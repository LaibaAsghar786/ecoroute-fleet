/**
 * EcoRoute Fleet - REST API Router
 * Implements endpoints specified in Section 8.2 & 8.3
 */

import { Router, Request, Response } from 'express';
import { db } from './db';
import { verifyChain, computeBlockHash } from './hashchain';
import { optimizeStopsGA } from './ga';
import { Truck, FuelLog, RouteEvent, Alert, VehicleProfile } from '../types';

export const apiRouter = Router();

// Fleet Summary KPI
apiRouter.get('/fleet/summary', (req: Request, res: Response) => {
  try {
    const summary = db.getFleetSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trucks List
apiRouter.get('/trucks', (req: Request, res: Response) => {
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

// Add Truck
apiRouter.post('/trucks', (req: Request, res: Response) => {
  try {
    const { plate, model, fuelType, driver, monthlyAllowanceKg, startingOdometer } = req.body;

    if (!plate || !model) {
      return res.status(400).json({ error: 'License plate and model are required.' });
    }

    // Check duplicate plate
    if (db.trucks.some((t) => t.plate.toUpperCase() === plate.trim().toUpperCase())) {
      return res.status(400).json({ error: 'This license plate is already registered.' });
    }

    const allowance = Number(monthlyAllowanceKg) || 5000;
    const newId = `TRUCK_PK_${String(70 + db.trucks.length).padStart(3, '0')}`;

    const newTruck: Truck = {
      id: newId,
      model: model.trim(),
      plate: plate.trim().toUpperCase(),
      driver: driver?.trim() || 'Unassigned',
      status: 'Idle',
      distanceKm: 0,
      co2TodayKg: 0,
      cargoKg: 0,
      integrity: 'Pending',
      fuelType: fuelType || 'Diesel',
      monthlyAllowanceKg: allowance,
      lastSync: 'Just now',
      odometerKm: Number(startingOdometer) || 0,
      lat: 24.86,
      lon: 67.01,
      currentSpeed: 0,
    };

    db.trucks.push(newTruck);
    res.status(201).json(newTruck);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Truck Details
apiRouter.get('/trucks/:id', (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const monthlySummary = db.getTruckMonthlySummary(truck.id);
    const trips = [
      {
        id: 'TRIP_KHI_HYD_102',
        truckId: truck.id,
        from: 'Karachi',
        to: 'Hyderabad',
        time: '06:10 - 09:40',
        distanceKm: 158,
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
        distanceKm: 150,
        co2Kg: 131,
        fuelL: 49,
        cargoKg: truck.cargoKg,
        status: 'Completed',
      },
    ];

    const savings = db.routeEvents.filter((r) => r.truckId === truck.id);

    res.json({
      truck,
      monthlySummary,
      trips,
      savings,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Truck Allowance or Details
apiRouter.patch('/trucks/:id', (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    if (req.body.monthlyAllowanceKg !== undefined) {
      const val = Number(req.body.monthlyAllowanceKg);
      if (val > 0 && val <= 100000) {
        truck.monthlyAllowanceKg = val;
      }
    }
    if (req.body.driver !== undefined) {
      truck.driver = String(req.body.driver).trim();
    }
    if (req.body.status !== undefined) {
      truck.status = req.body.status;
    }

    res.json(truck);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Day Detail
apiRouter.get('/trucks/:id/days/:day', (req: Request, res: Response) => {
  try {
    const truck = db.trucks.find((t) => t.id === req.params.id);
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const dayNum = Number(req.params.day) || 12;
    const days = db.getTruckDays(truck.id);
    const dayRecord = days.find((d) => d.day === dayNum) || days[0];

    res.json({
      truck,
      dayRecord,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fuel Logs
apiRouter.get('/fuel-logs', (req: Request, res: Response) => {
  res.json(db.fuelLogs);
});

apiRouter.post('/fuel-logs', (req: Request, res: Response) => {
  try {
    const { truckId, driverId, litres, odometerKm, cost, dateTime } = req.body;
    const L = Number(litres);
    const odo = Number(odometerKm);

    if (!truckId || !(L > 0 && L <= 2000) || !(odo >= 0)) {
      return res.status(400).json({
        error: 'Invalid fuel entry. Litres must be 0.1-2000 and odometer must be a positive number.',
      });
    }

    const truck = db.trucks.find((t) => t.id === truckId) || db.trucks[0];
    const newLog: FuelLog = {
      id: `FL-${Date.now()}`,
      truckId: truck.id,
      driverId: driverId || 'PK-094',
      driverName: truck.driver,
      dateTime: dateTime || new Date().toISOString(),
      litres: L,
      odometerKm: odo,
      cost: cost ? Number(cost) : undefined,
      status: 'synced',
    };

    db.fuelLogs.unshift(newLog);
    if (odo > (truck.odometerKm || 0)) {
      truck.odometerKm = odo;
    }

    res.status(201).json(newLog);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Route Events & Savings
apiRouter.get('/route-events', (req: Request, res: Response) => {
  res.json(db.routeEvents);
});

apiRouter.post('/route-events', (req: Request, res: Response) => {
  try {
    const {
      truckId,
      trigger,
      location,
      originalKm,
      originalMin,
      originalL,
      originalCo2Kg,
      ecoKm,
      ecoMin,
      ecoL,
      ecoCo2Kg,
      savedCo2Kg,
      savedDieselL,
      savedTimeMin,
      accepted,
    } = req.body;

    const newEvent: RouteEvent = {
      id: `RE-${Date.now()}`,
      date: '12 Oct',
      truckId: truckId || 'TRUCK_PK_094',
      trigger: trigger || 'Early warning',
      location: location || 'Hala Bypass',
      originalKm: originalKm || 18.4,
      originalMin: originalMin || 31,
      originalL: originalL || 7.2,
      originalCo2Kg: originalCo2Kg || 19.3,
      ecoKm: ecoKm || 19.1,
      ecoMin: ecoMin || 20,
      ecoL: ecoL || 1.2,
      ecoCo2Kg: ecoCo2Kg || 3.2,
      savedCo2Kg: savedCo2Kg || 16.0,
      savedDieselL: savedDieselL || 6.0,
      savedTimeMin: savedTimeMin || 11,
      accepted: !!accepted,
    };

    db.routeEvents.unshift(newEvent);
    res.status(201).json(newEvent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Alerts
apiRouter.get('/alerts', (req: Request, res: Response) => {
  const { type } = req.query;
  let list = db.alerts;
  if (type && type !== 'All') {
    list = list.filter((a) => a.type === type);
  }
  res.json(list);
});

apiRouter.post('/alerts/:id/read', (req: Request, res: Response) => {
  const alert = db.alerts.find((a) => a.id === req.params.id);
  if (alert) {
    alert.read = true;
  }
  res.json({ success: true });
});

apiRouter.post('/alerts/read-all', (req: Request, res: Response) => {
  db.alerts.forEach((a) => (a.read = true));
  res.json({ success: true });
});

// Data Integrity & Tamper Demo
apiRouter.get('/integrity', (req: Request, res: Response) => {
  const result = verifyChain(db.hashChain);
  res.json({
    blocks: db.hashChain,
    verification: result,
  });
});

apiRouter.post('/integrity/verify', (req: Request, res: Response) => {
  const result = verifyChain(db.hashChain);
  res.json(result);
});

apiRouter.post('/integrity/tamper', (req: Request, res: Response) => {
  try {
    const { seq, field, newValue } = req.body;
    const targetSeq = seq ? Number(seq) : 1041;
    const block = db.hashChain.find((b) => b.seq === targetSeq);

    if (!block) {
      return res.status(404).json({ error: 'Sequence block not found' });
    }

    // Tamper with record payload without updating the cryptographic hash
    if (field && newValue !== undefined) {
      (block.recordData as any)[field] = newValue;
    } else {
      block.recordData.cargoKg = 4800; // default tamper demo
    }

    block.status = 'Check needed';
    const result = verifyChain(db.hashChain);
    res.json({
      message: `Tampered sequence #${targetSeq} payload. Cryptographic verification now breaks!`,
      verification: result,
      tamperedBlock: block,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Multi-stop Route Optimization with GA
apiRouter.post('/planning/optimise', (req: Request, res: Response) => {
  try {
    const { stops, efficiency } = req.body;
    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({ error: 'At least 2 stops are required.' });
    }
    const result = optimizeStopsGA(stops, Number(efficiency) || 30);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Vehicle Profiles
apiRouter.get('/vehicle-profiles', (req: Request, res: Response) => {
  res.json(db.vehicleProfiles);
});

apiRouter.post('/vehicle-profiles', (req: Request, res: Response) => {
  try {
    const { name, type, efficiencyValue, fuelType } = req.body;
    const val = Number(efficiencyValue);
    if (!name || !(val > 0)) {
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
    res.status(201).json(newProfile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/vehicle-profiles/:id', (req: Request, res: Response) => {
  if (db.vehicleProfiles.length <= 1) {
    return res.status(400).json({ error: 'At least one vehicle profile must remain.' });
  }
  db.vehicleProfiles = db.vehicleProfiles.filter((p) => p.id !== req.params.id);
  res.json({ success: true });
});

// Allow CORS for external mobile apps connecting to the backend
apiRouter.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Telemetry Ingest Endpoint (For External Driver / Mobile Apps)
apiRouter.post(['/telemetry/ingest', '/v1/ingest/batch'], (req: Request, res: Response) => {
  try {
    const payload = req.body;
    let truckId = payload.truckId;
    let records = [];

    // Support single record or batch array format
    if (Array.isArray(payload.items)) {
      records = payload.items;
    } else if (Array.isArray(payload)) {
      records = payload;
    } else {
      records = [payload];
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'No telemetry records provided in request payload.' });
    }

    let processedCount = 0;
    records.forEach((item: any) => {
      const rec = item.record || item;
      const tid = rec.truckId || truckId || 'TRUCK_PK_094';
      const truck = db.trucks.find((t) => t.id === tid);

      if (truck) {
        // Update live status & position
        if (rec.speedKmh !== undefined || rec.speed !== undefined) {
          const sp = Number(rec.speedKmh ?? rec.speed);
          truck.currentSpeed = sp;
          truck.status = sp < 5 ? (rec.idle ? 'Idle' : 'Active') : 'Active';
        }
        if (rec.lat && rec.lon) {
          truck.lat = Number(rec.lat);
          truck.lon = Number(rec.lon);
        }
        if (rec.co2Kg || rec.co2G) {
          const addCo2 = rec.co2Kg ? Number(rec.co2Kg) : Number(rec.co2G) / 1000;
          truck.co2TodayKg += Number(addCo2.toFixed(2));
        }
        if (rec.distanceKm || rec.distanceDeltaKm) {
          truck.distanceKm += Number((rec.distanceDeltaKm || rec.distanceKm || 0).toFixed(2));
        }
        truck.lastSync = 'Just now';
        processedCount++;
      }
    });

    res.json({
      status: 'success',
      message: `Processed ${processedCount} telemetry records. Truck live status updated on web dashboard.`,
      recordsReceived: records.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Documentation Endpoint for Group Members / Mobile App Developers
apiRouter.get('/docs', (req: Request, res: Response) => {
  res.json({
    name: 'EcoRoute Fleet REST API Documentation',
    version: '1.0',
    description: 'Endpoints for external Mobile / Driver apps to integrate with the Manager Web Dashboard',
    endpoints: {
      ingestTelemetry: {
        method: 'POST',
        url: '/api/telemetry/ingest',
        headers: { 'Content-Type': 'application/json' },
        description: 'Send vehicle speed, location, and emission readings from mobile or OBD-II sensors',
        samplePayload: {
          truckId: 'TRUCK_PK_094',
          speedKmh: 62.5,
          rpm: 1850,
          lat: 25.396,
          lon: 68.358,
          fuelRateLph: 24.1,
          engineLoadPct: 68,
          coolantC: 85,
          cargoKg: 3500,
          co2Kg: 0.18,
          idle: 0,
        },
      },
      submitFuelLog: {
        method: 'POST',
        url: '/api/fuel-logs',
        headers: { 'Content-Type': 'application/json' },
        description: 'Log driver fuel refills',
        samplePayload: {
          truckId: 'TRUCK_PK_094',
          driverId: 'PK-094',
          litres: 120.5,
          odometerKm: 83500,
          cost: 32500,
          dateTime: '2026-11-02T12:00:00Z',
        },
      },
      submitEcoRouteEvent: {
        method: 'POST',
        url: '/api/route-events',
        headers: { 'Content-Type': 'application/json' },
        description: 'Record an accepted or declined eco-route detour decision',
        samplePayload: {
          truckId: 'TRUCK_PK_094',
          trigger: 'Early warning',
          location: 'Hala Bypass',
          savedCo2Kg: 16.1,
          savedDieselL: 6.0,
          savedTimeMin: 11,
          accepted: true,
        },
      },
      getTruckDetails: {
        method: 'GET',
        url: '/api/trucks/:id',
        description: 'Retrieve current truck statistics, monthly allowance, and targets',
      },
      getAlerts: {
        method: 'GET',
        url: '/api/alerts',
        description: 'Fetch active alerts for the vehicle',
      },
    },
  });
});

// Settings
apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json(db.settings);
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  try {
    db.settings = { ...db.settings, ...req.body };
    res.json(db.settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reset Database Seed
apiRouter.post('/seed/reset', (req: Request, res: Response) => {
  db.resetToDefaults();
  res.json({ message: 'Database reset to clean demo seed state.' });
});

