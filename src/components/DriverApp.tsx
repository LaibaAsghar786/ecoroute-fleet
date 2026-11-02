/**
 * EcoRoute Fleet - Driver Application (PWA View)
 * Implements full edge-node driver experience specified in Section 5
 */

import React, { useState, useEffect } from 'react';
import { Truck, FuelLog, ObdTelemetry } from '../types';
import { LeafletMap } from './LeafletMap';
import { t, SupportedLanguage } from '../i18n/translations';

interface DriverAppProps {
  currentTruck: Truck;
  online: boolean;
  onToggleOnline: () => void;
  lang: SupportedLanguage;
  onTakeEcoRoute: (savings: { co2: number; diesel: number; time: number }) => void;
  onSaveFuelLog: (log: Partial<FuelLog>) => Promise<void>;
  pendingCount: number;
}

export const DriverApp: React.FC<DriverAppProps> = ({
  currentTruck,
  online,
  onToggleOnline,
  lang,
  onTakeEcoRoute,
  onSaveFuelLog,
  pendingCount,
}) => {
  // Navigation screen state
  const [screen, setScreen] = useState<'login' | 'home' | 'trip' | 'live' | 'eco' | 'summary' | 'day' | 'history' | 'impact' | 'fuel' | 'offm' | 'profile' | 'sync'>('home');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Trip simulation state
  const [isTripActive, setIsTripActive] = useState(false);
  const [cargoKg, setCargoKg] = useState(3500);
  const [ecoSuggestions, setEcoSuggestions] = useState(true);
  const [voiceAlerts, setVoiceAlerts] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [isParked, setIsParked] = useState(false);
  const [tripCo2Kg, setTripCo2Kg] = useState(0);
  const [tripDieselL, setTripDieselL] = useState(0);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [nextStepIndex, setNextStepIndex] = useState(0);
  const [nextStepDistM, setNextStepDistM] = useState(3200);

  // OBD-II state
  const [obdConnected, setObdConnected] = useState(true);
  const [coolantTemp, setCoolantTemp] = useState(78);

  // Turn by turn instructions
  const NAVIGATION_STEPS = [
    { text: 'Continue on N-5 highway', dist: 3200 },
    { text: 'Take exit toward Hyderabad Bypass', dist: 1500 },
    { text: 'Turn right onto Hala Road eco-bypass', dist: 900 },
    { text: 'Keep left at the roundabout', dist: 600 },
    { text: 'Arrive at Nawabshah logistics depot', dist: 400 },
  ];

  // Offline map packs
  const [offlinePacks, setOfflinePacks] = useState<Record<string, boolean>>({
    'Sindh corridor (M-9 / N-5)': true,
    'Punjab corridor (M-4 / M-5)': false,
    'Karachi metropolitan area': false,
  });

  // PIN keypad handler
  const handleKeypad = (k: string) => {
    if (k === 'C') {
      setPin('');
      setPinError('');
    } else if (k === 'Del') {
      setPin((prev) => prev.slice(0, -1));
    } else if (pin.length < 4) {
      const next = pin + k;
      setPin(next);
      if (next.length === 4) {
        if (next === '1234') {
          setPin('');
          setPinError('');
          setScreen('home');
        } else {
          setPinError('Incorrect PIN. Demo PIN is 1234.');
          setPin('');
        }
      }
    }
  };

  // Live simulation tick when trip is active
  useEffect(() => {
    if (!isTripActive) return;

    const interval = setInterval(() => {
      // Speed dynamics
      setSpeed((prev) => {
        if (isParked) return 0;
        if (prev < 56) return prev + 6;
        return 56 + Math.floor(Math.sin(Date.now() / 1000) * 4);
      });

      // Accumulate emissions based on speed
      if (!isParked) {
        const curSp = speed > 0 ? speed : 50;
        const fuelRate = (8 + 0.38 * curSp) / 3600; // litres per second approx
        setTripDieselL((prev) => prev + fuelRate);
        setTripCo2Kg((prev) => prev + fuelRate * 2.68);
        setTripDistanceKm((prev) => prev + curSp / 3600);

        // Turn-by-turn countdown
        setNextStepDistM((prev) => {
          if (prev <= 50) {
            setNextStepIndex((curr) => (curr + 1) % NAVIGATION_STEPS.length);
            const nextDist = NAVIGATION_STEPS[(nextStepIndex + 1) % NAVIGATION_STEPS.length].dist;
            if (voiceAlerts && 'speechSynthesis' in window) {
              try {
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(NAVIGATION_STEPS[nextStepIndex].text));
              } catch (e) {}
            }
            return nextDist;
          }
          return prev - 25;
        });

        // Trigger early warning near hazard point
        if (ecoSuggestions && !showWarning && !warningDismissed && Math.random() < 0.15) {
          setShowWarning(true);
          if (voiceAlerts && 'speechSynthesis' in window) {
            try {
              window.speechSynthesis.speak(new SpeechSynthesisUtterance('Early warning. Slow traffic likely ahead. Decide before next exit.'));
            } catch (e) {}
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isTripActive, isParked, speed, ecoSuggestions, showWarning, warningDismissed, voiceAlerts, nextStepIndex]);

  // Compute live OBD telemetry
  const obdTelemetry: ObdTelemetry = {
    connected: obdConnected,
    speedKmh: isTripActive ? (isParked ? 0 : speed) : 0,
    rpm: isTripActive ? (isParked ? 750 : Math.round(780 + speed * 18)) : 0,
    fuelRateL100km: isTripActive && speed > 5 ? Number((12 + 600 / (speed + 10)).toFixed(1)) : 0,
    coolantTempC: coolantTemp,
    engineLoadPct: isTripActive ? (isParked ? 8 : Math.min(95, Math.round(15 + speed * 0.9))) : 0,
    isIdling: isTripActive && (isParked || speed < 5),
    engineStandby: !isTripActive,
  };

  // Toggle OBD-II connection simulation
  const toggleObd = () => {
    setObdConnected((prev) => !prev);
  };

  // Monthly allowance metrics
  const allowanceKg = currentTruck.monthlyAllowanceKg || 6000;
  const consumedCo2Kg = currentTruck.co2TodayKg + tripCo2Kg;
  const consumedCredits = Number((consumedCo2Kg / 1000).toFixed(2));
  const remainingCredits = Math.max(0, Number(((allowanceKg - consumedCo2Kg) / 1000).toFixed(2)));
  const consumedPct = Math.min(100, Number(((consumedCo2Kg / allowanceKg) * 100).toFixed(1)));

  // 1. Login Screen
  if (screen === 'login') {
    return (
      <div className="bg-[#F4F7F6] dark:bg-[#0E1A17] min-h-[720px] rounded-3xl overflow-hidden flex flex-col justify-between p-6">
        <div className="relative rounded-2xl overflow-hidden p-6 text-white bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] shadow-md min-h-[220px] flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center font-black text-sm">
              ER
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 font-semibold tracking-wide">
              DRIVER PWA
            </span>
          </div>
          <div>
            <div className="text-[10px] tracking-wider font-extrabold uppercase text-[#C5E6D9]">ECOROUTE DRIVER</div>
            <h1 className="text-2xl font-black tracking-tight leading-tight mt-1">Drive smart.<br />Cut carbon.</h1>
            <p className="text-xs text-[#E2F2E9] mt-1">Sign in to access your truck's live telemetry and eco-routes.</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-sm my-4">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#0B6E4F]">Driver Access</div>
          <h2 className="text-lg font-black text-[#1B2B27] dark:text-[#E6F0EC] mt-0.5">Sign in to Truck</h2>
          <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">Driver ID: PK-094 · Demo PIN: 1234</p>

          <div className="flex justify-center items-center gap-4 text-2xl font-mono my-4 text-[#0B6E4F]">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="w-4 text-center">
                {pin.length > i ? '●' : '○'}
              </span>
            ))}
          </div>

          {pinError && <div className="text-xs text-[#D64545] font-semibold text-center mb-2">{pinError}</div>}

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'Del'].map((k) => (
              <button
                key={String(k)}
                onClick={() => handleKeypad(String(k))}
                className="py-3 bg-[#F8FBF9] dark:bg-[#1D3A2F] border border-[#E1E8E5] dark:border-[#25382F] text-base font-bold rounded-xl active:scale-95 transition-transform"
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center text-[11px] text-[#5F6F6A] dark:text-[#9DB0A8]">
          Offline-ready telemetry · EcoRoute v1.0
        </div>
      </div>
    );
  }

  // Common Header for Authenticated Driver Views
  return (
    <div className="bg-[#F4F7F6] dark:bg-[#0E1A17] text-[#1B2B27] dark:text-[#E6F0EC] min-h-[740px] rounded-3xl overflow-hidden flex flex-col justify-between relative shadow-lg">
      {/* Top Header */}
      <div className="bg-gradient-to-r from-[#0A5C44] to-[#0F7F73] text-white px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">ER</div>
          <div>
            <div className="text-xs font-bold leading-tight">EcoRoute Driver</div>
            <div className="text-[10px] text-[#C5E6D9]">TRUCK_PK_094 · TK-5021</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Network status toggle badge */}
          <button
            onClick={onToggleOnline}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
              online
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                : 'bg-rose-500/20 text-rose-200 border-rose-400/40'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
            {online ? 'ONLINE' : `OFFLINE (${pendingCount})`}
          </button>
        </div>
      </div>

      {/* Truck ECU OBD-II Connection Bar */}
      <div className="bg-white dark:bg-[#16241F] border-b border-[#E1E8E5] dark:border-[#25382F] px-4 py-1.5 flex justify-between items-center text-[11px]">
        <div className="flex items-center gap-1.5 text-[#5F6F6A] dark:text-[#9DB0A8]">
          <span className={`w-2 h-2 rounded-full ${obdConnected ? 'bg-[#1E9E5A]' : 'bg-[#D64545]'}`} />
          <span>Truck ECU Link:</span>
          <b className={obdConnected ? 'text-[#1E9E5A]' : 'text-[#D64545]'}>
            {obdConnected ? 'OBD-II Connected' : 'OBD-II Disconnected'}
          </b>
        </div>
        <button
          onClick={toggleObd}
          className="text-[10px] text-[#2B7BD6] hover:underline"
        >
          {obdConnected ? 'Simulate Disconnect' : 'Reconnect'}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 pb-24">
        {/* VIEW 1: HOME */}
        {screen === 'home' && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold">Good morning, Bilal</h2>
                <div className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">Assigned to: Hino 500 Heavy</div>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                Verified
              </span>
            </div>

            {/* Monthly CO2 Credit Allowance Card */}
            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-[#1B2B27] dark:text-[#E6F0EC]">Monthly CO₂ Credit Allowance</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                  {consumedPct >= 80 ? 'Warning' : 'On Track'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#5F6F6A] dark:text-[#9DB0A8] my-1">
                <span>Consumed: <b>{consumedCredits} Credits</b></span>
                <span>Remaining: <b>{remainingCredits} Credits</b></span>
              </div>
              <div className="w-full bg-[#E1E8E5] dark:bg-[#25382F] h-2.5 rounded-full overflow-hidden my-2">
                <div
                  className="bg-gradient-to-r from-[#0B6E4F] to-[#0F7F73] h-full rounded-full transition-all duration-500"
                  style={{ width: `${consumedPct}%` }}
                />
              </div>
              <div className="text-[11px] text-[#5F6F6A] dark:text-[#9DB0A8]">
                {consumedPct}% used of {(allowanceKg / 1000).toFixed(0)} Credits allowance · 19 days remaining
              </div>
            </div>

            {/* OBD-II Telemetry Live Card */}
            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#0B6E4F]">OBD-II Live Telemetry</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${obdConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {obdConnected ? 'Streaming' : 'No Signal'}
                </span>
              </div>

              {obdConnected ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#EAF5F0] dark:bg-[#1D3A2F] p-2.5 rounded-xl">
                    <div className="text-[10px] text-[#5F6F6A] dark:text-[#9DB0A8]">Vehicle Speed</div>
                    <div className="text-lg font-black tabular-nums">{obdTelemetry.speedKmh} km/h</div>
                  </div>
                  <div className="bg-[#EAF5F0] dark:bg-[#1D3A2F] p-2.5 rounded-xl">
                    <div className="text-[10px] text-[#5F6F6A] dark:text-[#9DB0A8]">Engine RPM</div>
                    <div className="text-lg font-black tabular-nums">{obdTelemetry.engineStandby ? 'Standby' : `${obdTelemetry.rpm}`}</div>
                  </div>
                  <div className="bg-[#EAF5F0] dark:bg-[#1D3A2F] p-2.5 rounded-xl">
                    <div className="text-[10px] text-[#5F6F6A] dark:text-[#9DB0A8]">Instant Fuel</div>
                    <div className="text-lg font-black tabular-nums">{obdTelemetry.fuelRateL100km} L/100km</div>
                  </div>
                  <div className="bg-[#EAF5F0] dark:bg-[#1D3A2F] p-2.5 rounded-xl">
                    <div className="text-[10px] text-[#5F6F6A] dark:text-[#9DB0A8]">Coolant Temp</div>
                    <div className="text-lg font-black tabular-nums">{obdTelemetry.coolantTempC}°C</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#D64545] p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl">
                  ⚠️ No ECU telemetry received. Verify that the Bluetooth OBD-II dongle is plugged into the vehicle port.
                </div>
              )}
            </div>

            {/* Today So Far Hero Card */}
            <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-4 rounded-2xl shadow-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#C5E6D9]">TODAY SO FAR · ESTIMATED</div>
              <div className="text-3xl font-black tabular-nums tracking-tight my-1">
                {Math.round(consumedCo2Kg)} <span className="text-base font-normal">kg CO₂</span>
              </div>
              <div className="text-xs text-[#E2F2E9]">
                Equivalent to {consumedCredits} Credits Used · {Math.round(consumedCo2Kg / 2.68)} L Diesel
              </div>
            </div>

            {/* Metric Tiles */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
                <div className="text-[#5F6F6A] dark:text-[#9DB0A8]">Distance Today</div>
                <div className="text-base font-bold tabular-nums">{(currentTruck.distanceKm + tripDistanceKm).toFixed(0)} km</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
                <div className="text-[#5F6F6A] dark:text-[#9DB0A8]">Declared Cargo</div>
                <div className="text-base font-bold tabular-nums">{cargoKg.toLocaleString()} kg</div>
              </div>
            </div>

            {/* Eco-Route Savings Today */}
            <div className="bg-[#EAF5F0] dark:bg-[#1D3A2F] p-3 rounded-xl text-xs flex justify-between items-center">
              <div>
                <b className="text-[#0B6E4F] dark:text-[#4ADE80]">Eco-Route Savings Today</b>
                <div className="text-[#5F6F6A] dark:text-[#9DB0A8]">16 kg CO₂ · 6.0 L Diesel · 11 min saved</div>
              </div>
              <span className="text-base">🌱</span>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setScreen('fuel')}
                className="p-3 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold text-center hover:bg-slate-50 transition-colors"
              >
                <div className="text-base mb-1">⛽</div>
                Log Fuel
              </button>
              <button
                onClick={() => setScreen('offm')}
                className="p-3 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold text-center hover:bg-slate-50 transition-colors"
              >
                <div className="text-base mb-1">🗺️</div>
                Offline Maps
              </button>
              <button
                onClick={() => setScreen('sync')}
                className="p-3 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold text-center hover:bg-slate-50 transition-colors"
              >
                <div className="text-base mb-1">🔄</div>
                Sync Status
              </button>
            </div>

            {/* Big Action Button */}
            <button
              onClick={() => {
                if (isTripActive) {
                  setScreen('live');
                } else {
                  setScreen('trip');
                }
              }}
              className="w-full py-3.5 bg-gradient-to-r from-[#0B6E4F] to-[#0F7F73] text-white font-bold rounded-xl shadow-md text-sm active:scale-98 transition-transform"
            >
              {isTripActive ? 'Continue Active Trip →' : 'Start New Trip →'}
            </button>
          </>
        )}

        {/* VIEW 2: TRIP SETUP */}
        {screen === 'trip' && (
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen('home')} className="text-[#0B6E4F] font-bold">← Back</button>
              <h2 className="text-base font-bold">Configure Trip</h2>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl space-y-3 shadow-xs">
              <div>
                <label className="text-[#5F6F6A] block mb-1 font-semibold">Assigned Vehicle</label>
                <input
                  type="text"
                  value="TRUCK_PK_094 · Hino 500 Heavy"
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-[#1D3A2F] border border-transparent rounded-lg font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#5F6F6A] block mb-1 font-semibold">Origin</label>
                  <input
                    type="text"
                    value="Karachi Port Terminal"
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-[#1D3A2F] border border-transparent rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="text-[#5F6F6A] block mb-1 font-semibold">Destination</label>
                  <input
                    type="text"
                    value="Hyderabad / Nawabshah"
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-[#1D3A2F] border border-transparent rounded-lg font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Cargo Weight Stepper */}
            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs text-center">
              <div className="text-[#5F6F6A] dark:text-[#9DB0A8] font-semibold mb-2">Declared Cargo Weight</div>
              <div className="flex items-center justify-center gap-4 my-2">
                <button
                  onClick={() => setCargoKg((prev) => Math.max(0, prev - 100))}
                  className="w-10 h-10 rounded-full border border-[#E1E8E5] text-lg font-bold bg-slate-50 dark:bg-[#1D3A2F]"
                >
                  −
                </button>
                <div className="text-2xl font-black text-[#0B6E4F] tabular-nums">
                  {cargoKg.toLocaleString()} <span className="text-sm font-normal text-slate-500">kg</span>
                </div>
                <button
                  onClick={() => setCargoKg((prev) => prev + 100)}
                  className="w-10 h-10 rounded-full border border-[#E1E8E5] text-lg font-bold bg-slate-50 dark:bg-[#1D3A2F]"
                >
                  +
                </button>
              </div>
              <p className="text-[11px] text-[#5F6F6A]">Weight impacts fuel rate calculation (p4·load factor).</p>
            </div>

            {/* Eco Route Toggle */}
            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl flex justify-between items-center shadow-xs">
              <div>
                <b className="text-sm">Eco-Route Suggestions</b>
                <div className="text-[11px] text-[#5F6F6A]">Propose low-emission detour when congestion detected</div>
              </div>
              <button
                onClick={() => setEcoSuggestions((p) => !p)}
                className={`w-11 h-6 rounded-full relative transition-colors ${ecoSuggestions ? 'bg-[#0B6E4F]' : 'bg-slate-300'}`}
              >
                <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${ecoSuggestions ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Checklist */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-xl space-y-1">
              <div className="font-bold mb-1">Pre-Trip Checklist:</div>
              <div>✓ GPS Location Services Active</div>
              <div>✓ Offline Route Map Cached (Sindh Corridor)</div>
              <div>✓ Cryptographic SHA-256 Chain Initialized</div>
            </div>

            <button
              onClick={() => {
                setIsTripActive(true);
                setIsParked(false);
                setSpeed(0);
                setTripCo2Kg(0);
                setTripDieselL(0);
                setTripDistanceKm(0);
                setShowWarning(false);
                setWarningDismissed(false);
                setScreen('live');
              }}
              className="w-full py-3.5 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl shadow-md text-sm"
            >
              Start Trip Now
            </button>
          </div>
        )}

        {/* VIEW 3: LIVE ACTIVE TRIP */}
        {screen === 'live' && (
          <div className="space-y-3 text-xs">
            {/* Speedometer Hero */}
            <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-4 rounded-2xl shadow-sm text-center">
              <div className="text-[10px] font-extrabold tracking-wider uppercase text-[#C5E6D9]">SPEED & REAL-TIME EMISSION</div>
              <div className="text-5xl font-black tabular-nums tracking-tight my-1">
                {isParked ? 0 : speed} <span className="text-lg font-normal">km/h</span>
              </div>
              <div className="text-xs text-[#E2F2E9]">
                CO₂ Emission Rate: <b>{isParked ? '0.0' : ((8 + 0.38 * speed) / 3600 * 2680).toFixed(1)} g/s</b>
              </div>
            </div>

            {/* Trip Cumulative Metrics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
                <div className="text-[#5F6F6A]">Trip CO₂ Emitted</div>
                <div className="text-base font-bold tabular-nums">{tripCo2Kg.toFixed(1)} kg</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
                <div className="text-[#5F6F6A]">Diesel Consumed</div>
                <div className="text-base font-bold tabular-nums">{tripDieselL.toFixed(1)} L</div>
              </div>
            </div>

            {/* Turn-by-Turn Card */}
            <div className="bg-white dark:bg-[#16241F] border-l-4 border-l-[#2B7BD6] border border-[#E1E8E5] dark:border-[#25382F] p-3.5 rounded-xl shadow-xs flex justify-between items-center">
              <div>
                <div className="text-[10px] uppercase font-bold text-[#2B7BD6]">Turn-by-Turn Guidance</div>
                <b className="text-xs">{NAVIGATION_STEPS[nextStepIndex].text}</b>
              </div>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 font-bold rounded-lg tabular-nums">
                {nextStepDistM} m
              </span>
            </div>

            {/* Early Warning Banner */}
            {showWarning && (
              <div className="bg-[#FFF8E8] dark:bg-amber-950/60 border-2 border-[#F5A524] p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold">
                  <span>⚠️</span>
                  <span>Early Warning: Slow traffic ahead in 900 m</span>
                </div>
                <p className="text-[11px] text-amber-900 dark:text-amber-100">
                  Congestion detected on M-9 bypass. Last exit available in 1.2 km.
                </p>
                <button
                  onClick={() => setScreen('eco')}
                  className="w-full py-2 bg-[#F5A524] hover:bg-[#D98205] text-[#3D2B04] font-bold rounded-lg text-xs"
                >
                  Review Eco-Route Detour →
                </button>
              </div>
            )}

            {/* Mini Map */}
            <div className="rounded-xl overflow-hidden border border-[#E1E8E5] shadow-xs">
              <LeafletMap height="140px" miniMode={true} trucks={[currentTruck]} />
            </div>

            {/* Controls */}
            <div className="flex justify-between items-center bg-white dark:bg-[#16241F] p-3 rounded-xl border border-[#E1E8E5] dark:border-[#25382F]">
              <span>Voice Guidance</span>
              <button
                onClick={() => setVoiceAlerts((p) => !p)}
                className={`w-10 h-5 rounded-full relative transition-colors ${voiceAlerts ? 'bg-[#0B6E4F]' : 'bg-slate-300'}`}
              >
                <span className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${voiceAlerts ? 'left-5.5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Stop simulation / End trip */}
            <div className="space-y-2 pt-1">
              {!isParked && (
                <button
                  onClick={() => {
                    setIsParked(true);
                    setSpeed(0);
                  }}
                  className="w-full py-2.5 border border-[#E1E8E5] dark:border-[#25382F] bg-white dark:bg-[#16241F] font-bold rounded-xl"
                >
                  🛑 Stop / Park Vehicle
                </button>
              )}

              <button
                onClick={() => {
                  if (!isParked && speed > 5) {
                    alert('Safety rule: Stop the truck before ending the trip.');
                    return;
                  }
                  setIsTripActive(false);
                  setScreen('summary');
                }}
                className="w-full py-3 bg-[#D64545] hover:bg-[#B52B2B] text-white font-bold rounded-xl shadow-xs"
              >
                End Trip & Submit Log
              </button>
            </div>
          </div>
        )}

        {/* VIEW 4: ECO ROUTE DECISION */}
        {screen === 'eco' && (
          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-amber-50 border-2 border-amber-400 rounded-xl font-bold text-amber-900">
              ⚠️ Early Warning: Congestion Ahead
              <div className="text-[11px] font-normal text-amber-800 mt-0.5">
                Reroute decision point before exit in 1.2 km.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl">
                <b className="text-slate-700 dark:text-slate-300">Current Route</b>
                <div className="text-[11px] text-[#5F6F6A] mt-2 space-y-1">
                  <div>Distance: 18.4 km</div>
                  <div>Est. Time: 31 min</div>
                  <div>Diesel: 7.2 L</div>
                  <div className="font-bold text-rose-600">CO₂: 19.3 kg</div>
                </div>
              </div>

              <div className="bg-emerald-50 dark:bg-[#1D3A2F] border-2 border-emerald-500 p-3 rounded-xl">
                <div className="flex justify-between items-center">
                  <b className="text-emerald-800 dark:text-emerald-300">Eco Route</b>
                  <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">Recommended</span>
                </div>
                <div className="text-[11px] text-emerald-950 dark:text-emerald-100 mt-2 space-y-1">
                  <div>Distance: 19.1 km</div>
                  <div>Est. Time: 20 min</div>
                  <div>Diesel: 1.2 L</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300">CO₂: 3.2 kg</div>
                </div>
              </div>
            </div>

            {/* Savings Callout */}
            <div className="bg-gradient-to-r from-[#0B6E4F] to-[#0F7F73] text-white p-4 rounded-xl text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#C5E6D9]">ESTIMATED SAVINGS BY TAKING DETOUR</div>
              <div className="text-lg font-black my-1">
                Save 16.1 kg CO₂ · 6.0 L Diesel · 11 min
              </div>
              <div className="text-[11px] text-[#E2F2E9]">
                Slightly longer distance (19.1 vs 18.4 km) avoids stop-go idling traffic!
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  onTakeEcoRoute({ co2: 16.1, diesel: 6.0, time: 11 });
                  setShowWarning(false);
                  setWarningDismissed(true);
                  setScreen('live');
                }}
                className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl shadow-md"
              >
                ✓ Take Eco-Route Detour
              </button>

              <button
                onClick={() => {
                  setShowWarning(false);
                  setWarningDismissed(true);
                  setScreen('live');
                }}
                className="w-full py-2.5 border border-[#E1E8E5] dark:border-[#25382F] bg-white dark:bg-[#16241F] font-bold rounded-xl"
              >
                Stay on Current Route
              </button>
            </div>
            <div className="text-center text-[11px] text-[#5F6F6A]">This is an advisory. You are always in control.</div>
          </div>
        )}

        {/* VIEW 5: TRIP SUMMARY */}
        {screen === 'summary' && (
          <div className="space-y-3.5 text-xs text-center">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center justify-center text-2xl mx-auto">
              ✓
            </div>
            <h2 className="text-lg font-black">Trip Completed & Verified</h2>
            <div className="text-[#5F6F6A]">Records signed and appended to SHA-256 chain.</div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl space-y-2 text-left shadow-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[#5F6F6A]">Trip Distance</span>
                <b>{tripDistanceKm.toFixed(1)} km</b>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[#5F6F6A]">Total CO₂ Emitted</span>
                <b>{tripCo2Kg.toFixed(1)} kg CO₂</b>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[#5F6F6A]">Diesel Burned</span>
                <b>{tripDieselL.toFixed(1)} L</b>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#5F6F6A]">Integrity Status</span>
                <span className="text-emerald-600 font-bold">Verified</span>
              </div>
            </div>

            <button
              onClick={() => setScreen('home')}
              className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl shadow-md"
            >
              Done & Return Home
            </button>
          </div>
        )}

        {/* VIEW 6: FUEL LOG */}
        {screen === 'fuel' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen('home')} className="text-[#0B6E4F] font-bold">← Back</button>
              <h2 className="text-base font-bold">Refuel Log</h2>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl space-y-3 shadow-xs">
              <div>
                <label className="text-[#5F6F6A] block mb-1 font-semibold">Fuel Added (Litres)</label>
                <input
                  id="driver_fuel_l"
                  type="number"
                  step="0.1"
                  placeholder="e.g. 110.0"
                  className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
                />
              </div>

              <div>
                <label className="text-[#5F6F6A] block mb-1 font-semibold">Odometer (km)</label>
                <input
                  id="driver_fuel_odo"
                  type="number"
                  placeholder="e.g. 83650"
                  className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
                />
              </div>

              <button
                onClick={async () => {
                  const l = Number((document.getElementById('driver_fuel_l') as HTMLInputElement)?.value);
                  const odo = Number((document.getElementById('driver_fuel_odo') as HTMLInputElement)?.value);
                  if (l > 0 && odo > 0) {
                    await onSaveFuelLog({
                      truckId: currentTruck.id,
                      driverId: 'PK-094',
                      litres: l,
                      odometerKm: odo,
                      status: online ? 'synced' : 'pending',
                    });
                    setScreen('home');
                  } else {
                    alert('Please enter valid fuel litres and odometer reading.');
                  }
                }}
                className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl shadow-xs mt-2"
              >
                Save Fuel Log
              </button>
            </div>
          </div>
        )}

        {/* VIEW 7: OFFLINE MAPS */}
        {screen === 'offm' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen('home')} className="text-[#0B6E4F] font-bold">← Back</button>
              <h2 className="text-base font-bold">Offline Map Packs</h2>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
              <div className="text-[#5F6F6A] mb-3">Download road graphs and detour networks to navigate without cell coverage:</div>
              <div className="space-y-2.5">
                {Object.entries(offlinePacks).map(([pack, isDownloaded]) => (
                  <div key={pack} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-[#1D3A2F] rounded-xl">
                    <div>
                      <b className="block">{pack}</b>
                      <span className="text-[10px] text-[#5F6F6A]">{isDownloaded ? 'Cached locally (IndexedDB)' : '64 MB download'}</span>
                    </div>
                    <button
                      onClick={() => setOfflinePacks((p) => ({ ...p, [pack]: !p[pack] }))}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold ${isDownloaded ? 'border border-[#E1E8E5] text-[#5F6F6A]' : 'bg-[#0B6E4F] text-white'}`}
                    >
                      {isDownloaded ? 'Remove' : 'Download'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 8: SYNC / OFFLINE STATUS */}
        {screen === 'sync' && (
          <div className="space-y-3.5 text-xs text-center">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen('home')} className="text-[#0B6E4F] font-bold">← Back</button>
              <h2 className="text-base font-bold">Sync & Queue Status</h2>
            </div>

            <div className="p-4 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl space-y-2 text-left shadow-xs">
              <div className="flex justify-between">
                <span>Network Status:</span>
                <b className={online ? 'text-emerald-600' : 'text-rose-600'}>{online ? 'Online' : 'Offline'}</b>
              </div>
              <div className="flex justify-between">
                <span>Unsent Outbox Queue:</span>
                <b>{pendingCount} records queued</b>
              </div>
              <div className="flex justify-between">
                <span>Last Verified Sync:</span>
                <b>2 min ago</b>
              </div>
            </div>

            <button
              onClick={onToggleOnline}
              className="w-full py-2.5 border border-[#E1E8E5] dark:border-[#25382F] font-bold rounded-xl"
            >
              Simulate Network {online ? 'Loss (Go Offline)' : 'Reconnect (Go Online)'}
            </button>
          </div>
        )}

        {/* VIEW 9: PROFILE */}
        {screen === 'profile' && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <button onClick={() => setScreen('home')} className="text-[#0B6E4F] font-bold">← Back</button>
              <h2 className="text-base font-bold">Driver Profile</h2>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs space-y-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#EAF5F0] text-[#0B6E4F] font-bold flex items-center justify-center text-sm">
                  BA
                </div>
                <div>
                  <b className="text-sm">Bilal Ahmed</b>
                  <div className="text-[#5F6F6A]">Driver ID: PK-094 · Hino 500</div>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                <div>Company: AJ Logistics</div>
                <div>Vehicle Plate: TK-5021</div>
                <div>App Version: v1.0 (Store & Forward enabled)</div>
              </div>
            </div>

            <button
              onClick={() => setScreen('login')}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl"
            >
              Log Out of Driver App
            </button>
          </div>
        )}
      </div>

      {/* Floating Bottom Navigation Bar */}
      <div className="absolute left-3 right-3 bottom-3 p-1 bg-white/90 dark:bg-[#16241F]/90 backdrop-blur-md border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl shadow-xl flex justify-around text-[10px] z-10">
        <button
          onClick={() => setScreen('home')}
          className={`flex-1 py-1.5 flex flex-col items-center rounded-xl transition-colors ${screen === 'home' ? 'text-[#0B6E4F] font-bold bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'text-[#5F6F6A]'}`}
        >
          <span className="text-base">🏠</span>
          {t('Home', lang)}
        </button>
        <button
          onClick={() => setScreen(isTripActive ? 'live' : 'trip')}
          className={`flex-1 py-1.5 flex flex-col items-center rounded-xl transition-colors ${['trip', 'live', 'eco', 'summary'].includes(screen) ? 'text-[#0B6E4F] font-bold bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'text-[#5F6F6A]'}`}
        >
          <span className="text-base">🚀</span>
          {t('Trip', lang)}
        </button>
        <button
          onClick={() => setScreen('fuel')}
          className={`flex-1 py-1.5 flex flex-col items-center rounded-xl transition-colors ${screen === 'fuel' ? 'text-[#0B6E4F] font-bold bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'text-[#5F6F6A]'}`}
        >
          <span className="text-base">⛽</span>
          Refill
        </button>
        <button
          onClick={() => setScreen('offm')}
          className={`flex-1 py-1.5 flex flex-col items-center rounded-xl transition-colors ${screen === 'offm' ? 'text-[#0B6E4F] font-bold bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'text-[#5F6F6A]'}`}
        >
          <span className="text-base">🗺️</span>
          Maps
        </button>
        <button
          onClick={() => setScreen('profile')}
          className={`flex-1 py-1.5 flex flex-col items-center rounded-xl transition-colors ${screen === 'profile' ? 'text-[#0B6E4F] font-bold bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'text-[#5F6F6A]'}`}
        >
          <span className="text-base">👤</span>
          {t('Profile', lang)}
        </button>
      </div>
    </div>
  );
};
