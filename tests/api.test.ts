/**
 * EcoRoute Fleet - Automated Backend, Security, Hash-Chain & GA Verification Suite
 * Run via: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDbPath = path.join(os.tmpdir(), `ecoroute-test-db-${process.pid}-${Date.now()}.json`);
process.env.ECOROUTE_DB_PATH = tmpDbPath;
process.env.NODE_ENV = 'test';

import { createApiApp } from '../src/server/app';
import { optimizeStopsGA, runRouteBenchmarkSuite } from '../src/server/ga';
import { calculateCo2FromFuel, getRemainingDaysInMonth } from '../src/server/emission';

let server: http.Server;
let baseUrl = '';
let managerToken = '';
let driverToken = '';

test.before(async () => {
  const app = createApiApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const mgrRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'laiba.asghar@ecoroute.com', password: 'demo1234' }),
  });
  assert.equal(mgrRes.status, 200);
  const mgrData = await mgrRes.json();
  assert.equal(mgrData.user.name, 'Laiba Asghar');
  managerToken = mgrData.token;

  const drvRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'driver.pk094@ecoroute.com', password: 'driver1234' }),
  });
  assert.equal(drvRes.status, 200);
  const drvData = await drvRes.json();
  driverToken = drvData.token;
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try {
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  } catch {
    // ignore cleanup errors
  }
});

test('01 & 04 & 06 & 07: Telemetry deduplication, unknown truck rejection, GPS/bounds & delta vs odometer', async () => {
  const headers = {
    Authorization: `Bearer ${managerToken}`,
    'Content-Type': 'application/json',
  };

  // Unknown truck rejected explicitly with 400
  const unknownRes = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventId: 'evt-unknown-1',
      truckId: 'TRUCK_NON_EXISTENT',
      distanceDeltaKm: 5,
      lat: 25.0,
      lon: 67.5,
    }),
  });
  assert.equal(unknownRes.status, 400);
  const unknownJson = await unknownRes.json();
  assert.equal(unknownJson.results[0].code, 'UNKNOWN_TRUCK');

  // Ambiguous distanceKm rejected
  const ambRes = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventId: 'evt-ambig-1',
      truckId: 'TRUCK_PK_094',
      distanceKm: 100,
    }),
  });
  assert.equal(ambRes.status, 400);
  const ambJson = await ambRes.json();
  assert.equal(ambJson.results[0].code, 'AMBIGUOUS_DISTANCE_FIELD');

  // Invalid GPS & negative CO2 rejected
  const badGps = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventId: 'evt-bad-gps-1',
      truckId: 'TRUCK_PK_094',
      lat: 99,
      lon: 67.0,
      co2Kg: -5,
    }),
  });
  assert.equal(badGps.status, 400);

  // Valid 0,0 coordinates accepted & deduplication prevents double counting
  const trucksBefore = await (await fetch(`${baseUrl}/api/trucks`, { headers })).json();
  const t94Before = trucksBefore.find((t: any) => t.id === 'TRUCK_PK_094');

  const eventId = `evt-dedup-${Date.now()}`;
  const payload = {
    eventId,
    truckId: 'TRUCK_PK_094',
    tripId: 'TRIP_TEST_1',
    ts: '2026-11-14T10:00:00Z',
    lat: 0,
    lon: 0,
    speedKmh: 60,
    distanceDeltaKm: 5,
    odometerKm: (t94Before.odometerKm || 0) + 5,
    co2Kg: 4.5,
    fuelMl: 1680,
    idle: 0,
  };

  const first = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 200);
  const firstJson = await first.json();
  assert.equal(firstJson.acceptedCount, 1);

  const dup = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(dup.status, 200);
  const dupJson = await dup.json();
  assert.equal(dupJson.acceptedCount, 0);
  assert.equal(dupJson.duplicateCount, 1);

  const trucksAfter = await (await fetch(`${baseUrl}/api/trucks`, { headers })).json();
  const t94After = trucksAfter.find((t: any) => t.id === 'TRUCK_PK_094');
  assert.equal(Number((t94After.distanceKm - t94Before.distanceKm).toFixed(2)), 5);
  assert.equal(Number((t94After.co2TodayKg - t94Before.co2TodayKg).toFixed(2)), 4.5);
  assert.equal(t94After.lat, 0);
  assert.equal(t94After.lon, 0);
});

test('03 & 18: Authentication, RBAC isolation, and CORS allowlist enforcement', async () => {
  const unauth = await fetch(`${baseUrl}/api/fleet/summary`);
  assert.equal(unauth.status, 401);

  const drvDelete = await fetch(`${baseUrl}/api/trucks/TRUCK_PK_094`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert.equal(drvDelete.status, 403);

  const drvOtherTruck = await fetch(`${baseUrl}/api/telemetry/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${driverToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventId: 'evt-drv-forbidden',
      truckId: 'TRUCK_PK_108',
      distanceDeltaKm: 2,
    }),
  });
  assert.equal(drvOtherTruck.status, 403);

  const blockedCors = await fetch(`${baseUrl}/api/docs`, {
    headers: { Origin: 'https://evil-untrusted-domain.example' },
  });
  assert.equal(blockedCors.status, 403);
});

test('05 & 11: Per-truck SHA-256 hash chain + HMAC anchor verification & tamper detection', async () => {
  const headers = {
    Authorization: `Bearer ${managerToken}`,
    'Content-Type': 'application/json',
  };

  const verify94 = await fetch(`${baseUrl}/api/integrity/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ truckId: 'TRUCK_PK_094' }),
  });
  const v94 = await verify94.json();
  assert.equal(v94.verified, true);
  assert.equal(v94.anchorsVerified, true);

  const verifyAll = await fetch(`${baseUrl}/api/integrity/verify`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const vAll = await verifyAll.json();
  assert.equal(vAll.verified, false);
  assert.equal(vAll.firstBadTruckId, 'TRUCK_PK_108');
  assert.equal(vAll.firstBadSeq, 1041);
});

test('08 & 16: Strict fuel log validation and route-events zero preservation', async () => {
  const headers = {
    Authorization: `Bearer ${managerToken}`,
    'Content-Type': 'application/json',
  };

  // Unknown truck on fuel log returns 400
  const badFuelTruck = await fetch(`${baseUrl}/api/fuel-logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ truckId: 'NO_SUCH_TRUCK', litres: 50, odometerKm: 90000 }),
  });
  assert.equal(badFuelTruck.status, 400);

  // Lower odometer rejected with 400
  const lowOdo = await fetch(`${baseUrl}/api/fuel-logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ truckId: 'TRUCK_PK_094', litres: 50, odometerKm: 10 }),
  });
  assert.equal(lowOdo.status, 400);

  // Future date rejected with 400
  const futureDate = new Date(Date.now() + 86400 * 1000).toISOString();
  const futureFuel = await fetch(`${baseUrl}/api/fuel-logs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      truckId: 'TRUCK_PK_094',
      litres: 50,
      odometerKm: 999999,
      dateTime: futureDate,
    }),
  });
  assert.equal(futureFuel.status, 400);

  // Route event with valid 0 values preserves 0 and computes savings
  const reRes = await fetch(`${baseUrl}/api/route-events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      truckId: 'TRUCK_PK_094',
      trigger: 'Manual',
      location: 'M-9 Test Point',
      originalKm: 10,
      originalMin: 15,
      originalL: 5,
      ecoKm: 10,
      ecoMin: 15,
      ecoL: 0,
      accepted: true,
    }),
  });
  assert.equal(reRes.status, 201);
  const reData = await reRes.json();
  assert.equal(reData.ecoL, 0);
  assert.equal(reData.ecoCo2Kg, 0);
  assert.equal(reData.savedDieselL, 5);
});

test('09 & 10 & 19 & 20: Seeded GA reproducibility, baselines, unsupported city error, and emission factors', () => {
  assert.throws(
    () => optimizeStopsGA(['Karachi', 'Atlantis'], 30),
    /Unsupported city/
  );

  const run1 = optimizeStopsGA(
    ['Karachi', 'Multan', 'Hyderabad', 'Sukkur', 'Lahore'],
    32,
    { cargoKg: 4500, objective: 'emissions', seed: 12345 }
  );
  const run2 = optimizeStopsGA(
    ['Karachi', 'Multan', 'Hyderabad', 'Sukkur', 'Lahore'],
    32,
    { cargoKg: 4500, objective: 'emissions', seed: 12345 }
  );
  assert.deepEqual(run1.optimizedStops, run2.optimizedStops);
  assert.equal(run1.optimizedCo2Kg, run2.optimizedCo2Kg);
  assert.ok(run1.baselines.exactOptimum);
  assert.equal(run1.baselines.exactOptimum.optimalityGapPct, 0);

  const suite = runRouteBenchmarkSuite();
  assert.equal(suite.cases.length, 2);

  assert.equal(calculateCo2FromFuel(10, 'Diesel'), 26.8);
  assert.equal(calculateCo2FromFuel(10, 'CNG'), 27.5);
  assert.equal(calculateCo2FromFuel(10, 'EV'), 0);

  const period = getRemainingDaysInMonth(new Date('2026-11-15T00:00:00Z'));
  assert.equal(period.daysInMonth, 30);
  assert.equal(period.remainingDays, 15);
});

test('12: MQTT HTTP Webhook Bridge routes into deduplicated hash-chained ingest', async () => {
  const headers = {
    Authorization: `Bearer ${managerToken}`,
    'Content-Type': 'application/json',
  };
  const mqttRes = await fetch(`${baseUrl}/api/telemetry/mqtt-bridge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: 'ecoroute/trucks/TRUCK_PK_094/telemetry',
      payload: {
        eventId: `evt-mqtt-${Date.now()}`,
        speedKmh: 55,
        lat: 26.24,
        lon: 68.41,
        distanceDeltaKm: 1.5,
        co2Kg: 1.2,
      },
    }),
  });
  assert.equal(mqttRes.status, 200);
  const mqttJson = await mqttRes.json();
  assert.equal(mqttJson.bridge, 'mqtt-http');
  assert.equal(mqttJson.acceptedCount, 1);
});
