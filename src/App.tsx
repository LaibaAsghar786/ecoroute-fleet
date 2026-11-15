/**
 * EcoRoute Fleet - Main Application Root
 * UK English Fleet Carbon Emission & Telemetry Web Platform
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AuthUser,
  Truck,
  FuelLog,
  Alert,
  RouteEvent,
  HashChainBlock,
  ChainAnchor,
  VehicleProfile,
  CompanySettings,
} from './types';
import { ApiService } from './services/api';
import { ManagerViews } from './components/ManagerViews';
import { AddTruckModal, EditAllowanceModal, AddFuelLogModal } from './components/Modals';

export default function App() {
  // Authentication state: always starts on login page on initial load
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [emailInput, setEmailInput] = useState('laiba.asghar@ecoroute.com');
  const [passwordInput, setPasswordInput] = useState('demo1234');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Light / Dark theme toggle
  const [isDark, setIsDark] = useState(false);

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
  const [chainAnchors, setChainAnchors] = useState<ChainAnchor[]>([]);
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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const refreshData = useCallback(async () => {
    if (!ApiService.getToken()) return;
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
      if (chainRes && chainRes.blocks) {
        setHashChain(chainRes.blocks);
        setChainAnchors(chainRes.anchors || []);
      }
      if (profilesRes) setVehicleProfiles(profilesRes);
      if (settingsRes) setSettings(settingsRes);
    } catch (err) {
      console.warn('[EcoRoute] Error loading fleet data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refreshData();
    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [isLoggedIn, refreshData]);

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

  // Fixed UK English document metadata
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', 'en-GB');
    root.setAttribute('dir', 'ltr');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!emailInput || !emailInput.includes('@')) {
      setLoginError('Please enter a valid email address.');
      return;
    }
    if (!passwordInput) {
      setLoginError('Please enter your password.');
      return;
    }

    try {
      setIsLoggingIn(true);
      const { user } = await ApiService.login(emailInput.trim(), passwordInput);
      setCurrentUser(user);
      setIsLoggedIn(true);
      showToast('Signed in successfully.');
    } catch (err: any) {
      setLoginError(err.message || 'Email or password is incorrect.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await ApiService.logout();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentView('dash');
  };

  const handleSaveTruck = async (truckData: any) => {
    await ApiService.addTruck(truckData);
    await refreshData();
    showToast(`Truck ${truckData.plate} added successfully.`);
  };

  const handleSaveAllowance = async (truckId: string, allowanceKg: number) => {
    await ApiService.updateTruck(truckId, { monthlyAllowanceKg: allowanceKg });
    await refreshData();
    showToast(`CO₂ allowance updated for ${truckId}.`);
  };

  const handleSaveFuelLog = async (logData: Partial<FuelLog>) => {
    await ApiService.addFuelLog(logData);
    await refreshData();
    showToast('Fuel refill record synchronised with server.');
  };

  // Text-only sidebar navigation (no stickers or icons)
  const NAV_ITEMS: Array<{
    section?: string;
    id?: string;
    label?: string;
  }> = [
    { section: 'FLEET MANAGEMENT' },
    { id: 'dash', label: 'Dashboard' },
    { id: 'fleet', label: 'Fleet & Trucks' },
    { id: 'live', label: 'Live Map' },
    { id: 'plan', label: 'Multi-stop Planning' },
    { section: 'INSIGHTS & AUDIT' },
    { id: 'route', label: 'Route Savings' },
    { id: 'rep', label: 'Reports' },
    { id: 'cred', label: 'Carbon Credits' },
    { id: 'logs', label: 'Fuel & Fleet Logs' },
    { id: 'alert', label: 'Alerts' },
    { id: 'integ', label: 'Data Integrity' },
    { section: 'WORKSPACE' },
    { id: 'veh', label: 'Vehicle Profiles' },
    { id: 'set', label: 'Settings' },
    { id: 'api', label: 'Mobile App API' },
  ];

  // =========================================================================
  // LOGIN PAGE (Always shown first before dashboard)
  // =========================================================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F4F7F6] dark:bg-[#0E1A17] text-[#1B2B27] dark:text-[#E6F0EC]">
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14221D] text-white px-5 py-2.5 rounded-xl shadow-xl border border-white/20 text-xs font-semibold">
            {toastMessage}
          </div>
        )}

        {/* Theme toggle button on login screen (the only sticker kept) */}
        <button
          onClick={() => setIsDark((p) => !p)}
          className="fixed top-4 right-4 z-50 w-9 h-9 rounded-xl bg-white/90 dark:bg-[#16241F]/90 hover:bg-white dark:hover:bg-[#1D3A2F] border border-[#E1E8E5] dark:border-[#25382F] shadow-md flex items-center justify-center text-base transition-colors"
          title="Toggle Light / Dark mode"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-screen">
          {/* Left scenic hero banner */}
          <div
            className="relative p-8 md:p-14 flex flex-col justify-end text-white overflow-hidden bg-cover bg-center"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(4,24,18,0.15) 10%, rgba(4,24,18,0.85) 100%), url("public/login-background_a181d644.jpg")`,
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
                Plan efficient routes, monitor live fleet telemetry, and track verified fuel and carbon reductions in one platform.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                  Eco-routing
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                  Fleet Insights
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30 font-semibold backdrop-blur-xs">
                  SHA-256 Telemetry Audit
                </span>
              </div>
            </div>
          </div>

          {/* Right login form card */}
          <div className="flex items-center justify-center p-6 sm:p-12 bg-[#F7F9F7] dark:bg-[#0E1A17]">
            <div className="w-full max-w-md bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-8 shadow-xl space-y-5">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#0B6E4F] dark:text-[#4ADE80]">
                  Welcome to EcoRoute Fleet
                </div>
                <h2 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC] mt-1">
                  Sign in to EcoRoute Fleet
                </h2>
                <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8] mt-1">
                  Demo account: laiba.asghar@ecoroute.com · demo1234
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-[#FBFDFB] dark:bg-[#16241F] text-sm"
                    placeholder="name@company.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-[#FBFDFB] dark:bg-[#16241F] text-sm"
                    placeholder="Enter password"
                    required
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300" />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => showToast('Password reset instructions have been sent to your registered email.')}
                    className="text-[#0B6E4F] dark:text-[#4ADE80] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                {loginError && (
                  <div className="text-xs text-[#D64545] font-semibold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] disabled:opacity-60 text-white font-bold rounded-xl text-sm shadow-md transition-colors"
                >
                  {isLoggingIn ? 'Signing in...' : 'Sign in to Dashboard →'}
                </button>
              </form>

              <div className="pt-4 border-t border-[#E1E8E5] dark:border-[#25382F] text-center text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                © 2026 EcoRoute Fleet · AJ Logistics
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED DASHBOARD SHELL
  // =========================================================================
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7F6] dark:bg-[#0E1A17] text-[#1B2B27] dark:text-[#E6F0EC]">
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14221D] text-white px-5 py-2.5 rounded-xl shadow-xl border border-white/20 text-xs font-semibold">
          {toastMessage}
        </div>
      )}

      {/* Top Application Bar */}
      <header className="bg-gradient-to-r from-[#0A5C44] to-[#0F7F73] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-md z-40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center font-black text-sm">
            ER
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight block leading-none">
              EcoRoute Fleet
            </span>
            <span className="text-[10px] text-[#C5E6D9]">
              Carbon Emission & Telemetry Platform
            </span>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Theme Toggle Button (only sticker retained) */}
          <button
            onClick={() => setIsDark((p) => !p)}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-sm transition-colors"
            title="Toggle Light / Dark mode"
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <button
            onClick={async () => {
              try {
                await ApiService.resetSeed();
                await refreshData();
                showToast('Database reset to default demonstration dataset.');
              } catch (err: any) {
                showToast(err.message || 'Reset is restricted in production.');
              }
            }}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[10px] font-bold transition-colors hidden md:inline-block"
            title="Reset database to default dataset"
          >
            Reset Demo Data
          </button>
        </div>
      </header>

      {/* Main Layout Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white dark:bg-[#16241F] border-r border-[#E1E8E5] dark:border-[#25382F] p-4 flex flex-col justify-between shrink-0 overflow-y-auto hidden md:flex">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E1E8E5] dark:border-[#25382F]">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white flex items-center justify-center font-black text-sm">
                ER
              </div>
              <div>
                <b className="text-sm tracking-tight text-[#1B2B27] dark:text-[#E6F0EC] block">
                  {settings.companyName}
                </b>
                <small className="text-[10px] text-[#5F6F6A] block">Fleet Intelligence</small>
              </div>
            </div>

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
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                      isCurrent
                        ? 'bg-[#EAF5F0] text-[#0B6E4F] dark:bg-[#1D3A2F] dark:text-[#4ADE80] font-bold shadow-2xs'
                        : 'text-[#5F6F6A] dark:text-[#9DB0A8] hover:bg-[#EAF5F0]/60 dark:hover:bg-[#1D3A2F]/60'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Account Summary & Sign Out */}
          <div className="pt-3 border-t border-[#E1E8E5] dark:border-[#25382F] text-xs">
            <div className="flex items-center justify-between">
              <div>
                <b className="text-slate-800 dark:text-slate-200 block">
                  {currentUser?.name || settings.managerName}
                </b>
                <span className="text-[10px] text-[#5F6F6A] capitalize">
                  {currentUser?.role || 'Fleet'} Account
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Quick Navigation Bar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="md:hidden bg-white dark:bg-[#16241F] border-b border-[#E1E8E5] dark:border-[#25382F] px-3 py-2 flex gap-1.5 overflow-x-auto text-xs">
            {NAV_ITEMS.filter((i) => i.id).map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id!)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold ${
                  currentView === item.id
                    ? 'bg-[#0B6E4F] text-white'
                    : 'text-[#5F6F6A] dark:text-[#9DB0A8]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold text-rose-600 ml-auto"
            >
              Log out
            </button>
          </div>

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
              chainAnchors={chainAnchors}
              vehicleProfiles={vehicleProfiles}
              settings={settings}
              onNotify={showToast}
              onRefreshData={refreshData}
              onOpenAddTruck={() => setIsAddTruckOpen(true)}
              onOpenEditAllowance={(truck) => setEditingAllowanceTruck(truck)}
              onOpenAddFuelLog={() => setIsAddFuelLogOpen(true)}
              onMarkAlertRead={async (id) => {
                await ApiService.markAlertRead(id);
                setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, read: true } : a)));
              }}
              onMarkAllAlertsRead={async () => {
                await ApiService.markAllAlertsRead();
                setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
                showToast('All alerts marked as read.');
              }}
              onVerifyIntegrity={async () => {
                try {
                  const res = await ApiService.verifyIntegrity();
                  if (res && res.verified) {
                    showToast('Cryptographic audit verified: all SHA-256 chains and anchors are valid.');
                  } else {
                    showToast(
                      `Audit flag: ${res.errorReason || `tamper detected at sequence #${res.firstBadSeq}`}`
                    );
                  }
                  await refreshData();
                } catch (err: any) {
                  showToast(err.message || 'Integrity verification failed.');
                }
              }}
              onSimulateTamper={async () => {
                try {
                  await ApiService.simulateTamper(1041);
                  await refreshData();
                  showToast('Tamper injected into sequence #1041. Run Verify All Chains to inspect detection.');
                } catch (err: any) {
                  showToast(err.message || 'Tamper demonstration is restricted.');
                }
              }}
              onOptimizeRoute={async (stops, cargoKg, objective) => {
                return await ApiService.optimizeStops(stops, 30, cargoKg, objective);
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
      </div>

      {/* Modals */}
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
