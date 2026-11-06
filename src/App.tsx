/**
 * EcoRoute Fleet - Main Application Root
 * Seamlessly integrates Manager Web Dashboard and Driver PWA App with Express Backend
 */

import React, { useState, useEffect } from 'react';
import {
  Truck,
  FuelLog,
  Alert,
  RouteEvent,
  HashChainBlock,
  VehicleProfile,
  CompanySettings,
} from './types';
import { ApiService } from './services/api';
import { ManagerViews } from './components/ManagerViews';
import { AddTruckModal, EditAllowanceModal, AddFuelLogModal } from './components/Modals';
import { LANGUAGES, SupportedLanguage, t } from './i18n/translations';
import {Sun , Moon} from 'lucide-react';

export default function App() {
  // Mode: 'web' (Manager Dashboard) or 'app' (Driver PWA)
  const [appMode, setAppMode] = useState<'web' | 'app'>('web');

  // Manager Authentication State
  const [isManagerLoggedIn, setIsManagerLoggedIn] = useState(false);
  const [managerEmail, setManagerEmail] = useState('laiba.asghar@ecoroute.com');
  const [managerPassword, setManagerPassword] = useState('demo1234');
  const [loginError, setLoginError] = useState('');

  // Language & Theme
  const [lang, setLang] = useState<SupportedLanguage>('en-GB');
  const [isDark, setIsDark] = useState(false);

  // Simulated Network Connection & Offline Queue
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

  // Navigation View State
  const [currentView, setCurrentView] = useState('dash');
  const [selectedTruckId, setSelectedTruckId] = useState('TRUCK_PK_094');
  const [selectedDay, setSelectedDay] = useState(12);

  // Domain Data State
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [routeEvents, setRouteEvents] = useState<RouteEvent[]>([]);
  const [hashChain, setHashChain] = useState<HashChainBlock[]>([]);
  const [vehicleProfiles, setVehicleProfiles] = useState<VehicleProfile[]>([]);
  const [settings, setSettings] = useState<CompanySettings>({
    companyName: 'AJ Logistics',
    managerName: 'Laiba Asghar',
    managerEmail: 'laiba.asghar@ecoroute.com',
    monthlyAllowanceTotalKg: 100000,
    idleAlertMinutes: 10,
    dailyCo2TargetPerTruckKg: 450,
    earlyWarningSensitivity: 'Normal',
    fuelVarianceThresholdPct: 15,
    units: 'km_L_kg',
    language: 'en-GB',
  });

  // Modal Visibility State
  const [isAddTruckOpen, setIsAddTruckOpen] = useState(false);
  const [editingAllowanceTruck, setEditingAllowanceTruck] = useState<Truck | null>(null);
  const [isAddFuelLogOpen, setIsAddFuelLogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Sync / Load Initial Data from Backend
  const refreshData = async () => {
    try {
      const [trucksRes, logsRes, alertsRes, eventsRes, chainRes, profilesRes, settingsRes] =
        await Promise.all([
          ApiService.getTrucks(),
          ApiService.getFuelLogs(),
          ApiService.getAlerts(),
          ApiService.getRouteEvents(),
          ApiService.getIntegrityData(),
          ApiService.getVehicleProfiles(),
          ApiService.getSettings(),
        ]);

      if (trucksRes && trucksRes.length > 0) setTrucks(trucksRes);
      if (logsRes) setFuelLogs(logsRes);
      if (alertsRes) setAlerts(alertsRes);
      if (eventsRes) setRouteEvents(eventsRes);
      if (chainRes && chainRes.blocks) setHashChain(chainRes.blocks);
      if (profilesRes) setVehicleProfiles(profilesRes);
      if (settingsRes) setSettings(settingsRes);
    } catch (err) {
      console.warn('[EcoRoute] Loading data from backend error:', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000); // 10s auto poll
    return () => clearInterval(interval);
  }, []);

  // Theme Sync
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [isDark]);

  // Language & RTL Sync
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
  }, [lang]);

  // Handle Manager Login
  const handleManagerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!managerEmail || !managerEmail.includes('@')) {
      setLoginError('Please enter a valid email address.');
      return;
    }
    if (managerPassword.length < 4) {
      setLoginError('Email or password is incorrect.');
      return;
    }

    setIsManagerLoggedIn(true);
    showToast('Signed in successfully.');
  };

  // Add Truck Handler
  const handleSaveTruck = async (truckData: any) => {
    await ApiService.addTruck(truckData);
    await refreshData();
    showToast(`Truck ${truckData.plate} added successfully.`);
  };

  // Edit Allowance Handler
  const handleSaveAllowance = async (truckId: string, allowanceKg: number) => {
    await ApiService.updateTruck(truckId, { monthlyAllowanceKg: allowanceKg });
    await refreshData();
    showToast(`CO₂ allowance updated for ${truckId}.`);
  };

  // Add Fuel Log Handler
  const handleSaveFuelLog = async (logData: Partial<FuelLog>) => {
    if (!isOnline) {
      // Queue offline
      setOfflineQueue((prev) => [...prev, logData]);
      showToast('Saved offline. Log queued for upload when network returns.');
    } else {
      await ApiService.addFuelLog(logData);
      await refreshData();
      showToast('Fuel refill record synchronized with server.');
    }
  };

  // Eco Route Decision from Driver App
  const handleTakeEcoRoute = async (savings: { co2: number; diesel: number; time: number }) => {
    await ApiService.addRouteEvent({
      truckId: 'TRUCK_PK_094',
      trigger: 'Early warning',
      location: 'Hala Road Dynamic Detour',
      originalKm: 18.4,
      originalMin: 31,
      originalL: 7.2,
      originalCo2Kg: 19.3,
      ecoKm: 19.1,
      ecoMin: 20,
      ecoL: 1.2,
      ecoCo2Kg: 3.2,
      savedCo2Kg: savings.co2,
      savedDieselL: savings.diesel,
      savedTimeMin: savings.time,
      accepted: true,
    });
    await refreshData();
    showToast(`Eco-Route accepted! Saved ${savings.co2} kg CO₂.`);
  };

  // Toggle Simulated Network Connection
  const handleToggleOnline = async () => {
    const nextState = !isOnline;
    setIsOnline(nextState);

    if (nextState) {
      // Flush offline queue if returning online
      if (offlineQueue.length > 0) {
        for (const item of offlineQueue) {
          try {
            await ApiService.addFuelLog(item);
          } catch (e) {}
        }
        setOfflineQueue([]);
        await refreshData();
        showToast('Network restored! Queued records successfully synchronized.');
      } else {
        showToast('Network restored. Connected to server.');
      }
    } else {
      showToast('Simulating network outage. Data is being safely queued locally.');
    }
  };

  // Navigation Items for Sidebar
  const NAV_ITEMS = [
    { section: 'FLEET MANAGEMENT' },
    { id: 'dash', label: t('Dashboard', lang), icon: '' },
    { id: 'fleet', label: t('Fleet & Trucks', lang), icon: '' },
    { id: 'live', label: t('Live Map', lang), icon: '' },
    { id: 'plan', label: t('Multi-stop Planning', lang), icon: '' },
    { section: 'INSIGHTS & AUDIT' },
    { id: 'route', label: t('Route Savings', lang), icon: '' },
    { id: 'rep', label: t('Reports', lang), icon: '' },
    { id: 'cred', label: t('Carbon Credits', lang), icon: '' },
    { id: 'logs', label: t('Fuel & Fleet Logs', lang), icon: '' },
    { id: 'alert', label: t('Alerts', lang), icon: '' },
    { id: 'integ', label: t('Data Integrity', lang), icon: '' },
    { section: 'WORKSPACE' },
    { id: 'veh', label: t('Vehicle Profiles', lang), icon: '' },
    { id: 'set', label: t('Settings', lang), icon: '' },
    { id: 'api', label: 'Mobile App API', icon: '' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F6] dark:bg-[#0E1A17] text-[#1B2B27] dark:text-[#E6F0EC]">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14221D] text-white px-5 py-2.5 rounded-xl shadow-xl border border-white/20 text-xs font-semibold animate-in fade-in slide-in-from-bottom duration-200">
          {toastMessage}
        </div>
      )}

      {/* Top Application Bar with Mode Switcher & Global Status */}
      <header className="bg-gradient-to-r from-[#0A5C44] to-[#0F7F73] text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md z-40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center font-black text-sm">
              ER
            </div>
            <span className="font-extrabold text-sm tracking-tight hidden sm:inline">EcoRoute Fleet</span>
          </div>
          </div>

          {/* Primary View Mode Switcher 
          <div className="flex bg-black/20 p-1 rounded-full border border-white/20 font-bold">
            <button
              onClick={() => setAppMode('web')}
              className={`px-3.5 py-1 rounded-full transition-all duration-200 ${
                appMode === 'web'
                  ? 'bg-white text-[#0B6E4F] shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Manager Web
            </button>
            <button
              onClick={() => setAppMode('app')}
              className={`px-3.5 py-1 rounded-full transition-all duration-200 ${
                appMode === 'app'
                  ? 'bg-white text-[#0B6E4F] shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Driver App
            </button>
          </div>
        </div>*/}

        {/* Global Status Indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Online/Offline Simulator Button */}
          <button
            onClick={handleToggleOnline}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1.5 ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                : 'bg-rose-500/20 text-rose-200 border-rose-400/40'
            }`}
            title="Click to toggle network loss simulation"
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
            {isOnline ? 'ONLINE MODE' : `OFFLINE (${offlineQueue.length} queued)`}
          </button>

          {/* Language Selector 
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as SupportedLanguage)}
            className="bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1 text-xs font-medium focus:outline-hidden"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="text-slate-900 bg-white">
                {l.label}
              </option>
            ))}
          </select>*/}

          {/* Theme Toggle Button */}
          <button  
            onClick={() => setIsDark((p) => !p)}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-sm transition-colors"
            title="Toggle Light / Dark mode"
          >
            {isDark ? <Sun size={16} />  : <Moon size={16} />}
          </button>

          {/* Reset Demo Data Button */}
          <button
            onClick={async () => {
              await ApiService.resetSeed();
              await refreshData();
              showToast('Reset to original prototype seed data.');
            }}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[10px] font-bold transition-colors hidden md:inline-block"
            title="Reset database to seed dataset"
          >
            Reset Demo Data
          </button>
        </div>
      </header>

      {/* VIEWPORT BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* =======================================================
            MODE 1: DRIVER APPLICATION (PWA View)
            ======================================================= */}
        {appMode === 'app' ? (
          <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-900/10 dark:bg-black/40">
            <div className="w-full max-w-[390px] shadow-2xl rounded-3xl overflow-hidden border-8 border-[#14221D]">
              <DriverApp
                currentTruck={trucks[0] || { id: 'TRUCK_PK_094', co2TodayKg: 412, distanceKm: 468, monthlyAllowanceKg: 6000 }}
                online={isOnline}
                onToggleOnline={handleToggleOnline}
                lang={lang}
                onTakeEcoRoute={handleTakeEcoRoute}
                onSaveFuelLog={handleSaveFuelLog}
                pendingCount={offlineQueue.length}
              />
            </div>
          </div>
        ) : (
          /* =======================================================
             MODE 2: MANAGER WEB DASHBOARD
             ======================================================= */
          !isManagerLoggedIn ? (
            /* Manager Login Screen (from prototype redesign) */
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-screen">
              {/* Left scenic hero banner */}
              <div
                className="relative p-8 md:p-14 flex flex-col justify-end text-white overflow-hidden bg-cover bg-center"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(4,24,18,0.15) 10%, rgba(4,24,18,0.85) 100%), url("/assets/aistudio/login-background_a181d644.jpg")`,
                }}
              >
                <div className="relative z-10 max-w-lg space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-lg font-black">
                    ER
                  </div>
                  <div className="text-xs font-extrabold uppercase tracking-widest text-[#C5E6D9]">
                    EcoRoute Fleet Intelligence
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
                    Every mile.<br />Smarter. Cleaner.
                  </h1>
                  <p className="text-sm md:text-base text-slate-100 leading-relaxed">
                    Plan efficient routes, monitor live fleet telemetry, and track verified fuel and carbon reductions—all in one place.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                      Eco-routing
                    </span>
                    <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                      Fleet Insights
                    </span>
                    <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                      Offline-ready App
                    </span>
                  </div>
                </div>
              </div>

              {/* Right login form card */}
              <div className="flex items-center justify-center p-6 sm:p-12 bg-[#F7F9F7] dark:bg-[#0E1A17]">
                <div className="w-full max-w-md bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-8 shadow-xl space-y-5">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wider text-[#0B6E4F]">
                      Welcome to EcoRoute
                    </div>
                    <h2 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC] mt-1">
                      Sign in to Fleet Manager
                    </h2>
                    <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                      Demo account: laiba.asghar@ecoroute.com · demo1234
                    </p>
                  </div>

                  <form onSubmit={handleManagerLogin} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-xs font-semibold text-[#5F6F6A] mb-1">Email address</label>
                      <input
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-[#FBFDFB] dark:bg-[#16241F] text-sm"
                        placeholder="name@company.com"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#5F6F6A] mb-1">Password</label>
                      <input
                        type="password"
                        value={managerPassword}
                        onChange={(e) => setManagerPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-[#FBFDFB] dark:bg-[#16241F] text-sm"
                        placeholder="Enter password"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#5F6F6A]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded border-slate-300" />
                        Remember me
                      </label>
                      <button
                        type="button"
                        onClick={() => alert('Demo simulated password reset link sent.')}
                        className="text-[#0B6E4F] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {loginError && (
                      <div className="text-xs text-[#D64545] font-semibold bg-rose-50 p-2.5 rounded-lg">
                        {loginError}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-sm shadow-md transition-colors"
                    >
                      Sign in to Dashboard →
                    </button>
                  </form>

                  <div className="pt-4 border-t border-[#E1E8E5] dark:border-[#25382F] text-center text-xs text-[#5F6F6A]">
                    © 2026 EcoRoute Fleet · AJ Logistics
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Manager Dashboard Shell with Sidebar + Main Viewport */
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar */}
              <aside className="w-56 bg-white dark:bg-[#16241F] border-r border-[#E1E8E5] dark:border-[#25382F] p-4 flex flex-col justify-between shrink-0 overflow-y-auto hidden md:flex">
                <div className="space-y-4">
                  {/* Brand Block */}
                  <div className="flex items-center gap-2.5 pb-2 border-b border-[#E1E8E5] dark:border-[#25382F]">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white flex items-center justify-center font-black text-sm">
                      ER
                    </div>
                    <div>
                      <b className="text-sm tracking-tight text-[#1B2B27] dark:text-[#E6F0EC] block">EcoRoute Fleet</b>
                      <small className="text-[10px] text-[#5F6F6A] block">Fleet Intelligence</small>
                    </div>
                  </div>

                  {/* Nav Links List */}
                  <nav className="space-y-0.5">
                    {NAV_ITEMS.map((item, idx) => {
                      if (item.section) {
                        return (
                          <div
                            key={idx}
                            className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6F6A] px-2 pt-3 pb-1"
                          >
                            {item.section}
                          </div>
                        );
                      }
                      const isCurrent = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setCurrentView(item.id!)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                            isCurrent
                              ? 'bg-[#EAF5F0] text-[#0B6E4F] dark:bg-[#1D3A2F] dark:text-[#4ADE80] font-bold shadow-2xs'
                              : 'text-[#5F6F6A] dark:text-[#9DB0A8] hover:bg-[#EAF5F0]/60 dark:hover:bg-[#1D3A2F]/60'
                          }`}
                        >
                          <span className="text-base">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {/* Manager User Info & Sign Out */}
                <div className="pt-3 border-t border-[#E1E8E5] dark:border-[#25382F] text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <b className="text-slate-800 dark:text-slate-200 block">Laiba Asghar</b>
                      <span className="text-[10px] text-[#5F6F6A]">Fleet Manager</span>
                    </div>
                    <button
                      onClick={() => setIsManagerLoggedIn(false)}
                      className="text-xs text-rose-600 hover:underline font-semibold"
                    >
                      {t('Log out', lang)}
                    </button>
                  </div>
                </div>
              </aside>

              {/* Main Content Area */}
              <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <ManagerViews
                  view={currentView}
                  setView={setCurrentView}
                  selectedTruckId={selectedTruckId}
                  setSelectedTruckId={setSelectedTruckId}
                  selectedDay={selectedDay}
                  setSelectedDay={setSelectedDay}
                  trucks={trucks}
                  fuelLogs={fuelLogs}
                  alerts={alerts}
                  routeEvents={routeEvents}
                  hashChain={hashChain}
                  vehicleProfiles={vehicleProfiles}
                  settings={settings}
                  lang={lang}
                  onOpenAddTruck={() => setIsAddTruckOpen(true)}
                  onOpenEditAllowance={(truck) => setEditingAllowanceTruck(truck)}
                  onOpenAddFuelLog={() => setIsAddFuelLogOpen(true)}
                  onMarkAlertRead={(id) => {
                    ApiService.markAlertRead(id);
                    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
                  }}
                  onMarkAllAlertsRead={() => {
                    ApiService.markAllAlertsRead();
                    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
                    showToast('All alerts marked as read.');
                  }}
                  onVerifyIntegrity={async () => {
                    const res = await ApiService.verifyIntegrity();
                    if (res && res.verified) {
                      showToast('Cryptographic audit verified: all SHA-256 blocks are valid.');
                    } else {
                      showToast(`Audit flag: tamper detected at sequence #${res.firstBadSeq}!`);
                    }
                    await refreshData();
                  }}
                  onSimulateTamper={async () => {
                    await ApiService.simulateTamper(1041);
                    await refreshData();
                    showToast('Tamper injected into sequence #1041. Run verify to see cryptographic detection!');
                  }}
                  onOptimizeRoute={async (stops) => {
                    return await ApiService.optimizeStops(stops);
                  }}
                  onAddVehicleProfile={async (profile) => {
                    await ApiService.addVehicleProfile(profile);
                    await refreshData();
                    showToast('Vehicle profile saved.');
                  }}
                  onDeleteVehicleProfile={async (id) => {
                    await ApiService.deleteVehicleProfile(id);
                    await refreshData();
                    showToast('Profile deleted.');
                  }}
                  onSaveSettings={async (updatedSettings) => {
                    await ApiService.updateSettings(updatedSettings);
                    await refreshData();
                    showToast('Settings saved.');
                  }}
                />
              </main>
            </div>
          )
        )}
      </div>

      {/* MODALS */}
      <AddTruckModal
        isOpen={isAddTruckOpen}
        onClose={() => setIsAddTruckOpen(false)}
        onSave={handleSaveTruck}
      />

      <EditAllowanceModal
        truck={editingAllowanceTruck}
        isOpen={!!editingAllowanceTruck}
        onClose={() => setEditingAllowanceTruck(null)}
        onSave={handleSaveAllowance}
      />

      <AddFuelLogModal
        trucks={trucks}
        isOpen={isAddFuelLogOpen}
        onClose={() => setIsAddFuelLogOpen(false)}
        onSave={handleSaveFuelLog}
      />
    </div>
  );
}
