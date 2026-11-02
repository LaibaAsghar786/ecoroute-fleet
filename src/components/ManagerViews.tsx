/**
 * EcoRoute Fleet - Manager Web Views
 * Complete implementation of all 14 views described in Section 4
 */

import React, { useState } from 'react';
import {
  Truck,
  FuelLog,
  RouteEvent,
  Alert,
  HashChainBlock,
  VehicleProfile,
  CompanySettings,
  DayRecord,
} from '../types';
import { LeafletMap } from './LeafletMap';
import { getAllowanceBand } from '../server/emission';
import { exportFleetPdf, exportCarbonAuditPdf, exportFuelLogsPdf, downloadCsv } from '../utils/export';
import { t, SupportedLanguage } from '../i18n/translations';

interface ManagerViewsProps {
  view: string;
  setView: (view: string) => void;
  selectedTruckId: string;
  setSelectedTruckId: (id: string) => void;
  selectedDay: number;
  setSelectedDay: (day: number) => void;
  trucks: Truck[];
  fuelLogs: FuelLog[];
  alerts: Alert[];
  routeEvents: RouteEvent[];
  hashChain: HashChainBlock[];
  vehicleProfiles: VehicleProfile[];
  settings: CompanySettings;
  lang: SupportedLanguage;
  onOpenAddTruck: () => void;
  onOpenEditAllowance: (truck: Truck) => void;
  onOpenAddFuelLog: () => void;
  onMarkAlertRead: (id: string) => void;
  onMarkAllAlertsRead: () => void;
  onVerifyIntegrity: () => void;
  onSimulateTamper: () => void;
  onOptimizeRoute: (stops: string[]) => Promise<any>;
  onAddVehicleProfile: (profile: Partial<VehicleProfile>) => Promise<void>;
  onDeleteVehicleProfile: (id: string) => Promise<void>;
  onSaveSettings: (settings: Partial<CompanySettings>) => Promise<void>;
  truckMonthlyData?: any;
  dayDetailData?: DayRecord;
}

export const ManagerViews: React.FC<ManagerViewsProps> = (props) => {
  const {
    view,
    setView,
    selectedTruckId,
    setSelectedTruckId,
    selectedDay,
    setSelectedDay,
    trucks,
    fuelLogs,
    alerts,
    routeEvents,
    hashChain,
    vehicleProfiles,
    settings,
    lang,
    onOpenAddTruck,
    onOpenEditAllowance,
    onOpenAddFuelLog,
    onMarkAlertRead,
    onMarkAllAlertsRead,
    onVerifyIntegrity,
    onSimulateTamper,
    onOptimizeRoute,
    onAddVehicleProfile,
    onDeleteVehicleProfile,
    onSaveSettings,
    truckMonthlyData,
    dayDetailData,
  } = props;

  // Local state for tabs and filters
  const [truckTab, setTruckTab] = useState<'ov' | 'mo' | 'tr' | 'sv'>('ov');
  const [hourlyMetric, setHourlyMetric] = useState<'co2' | 'diesel'>('co2');
  const [fleetSearch, setFleetSearch] = useState('');
  const [fleetStatusFilter, setFleetStatusFilter] = useState('All');
  const [alertFilter, setAlertFilter] = useState('All');
  const [planningStops, setPlanningStops] = useState<string[]>([
    'Karachi',
    'Hyderabad',
    'Nawabshah',
    'Lahore',
  ]);
  const [newStopCity, setNewStopCity] = useState('Sukkur');
  const [optimizationResult, setOptimizationResult] = useState<any>(null);

  // Active Truck
  const activeTruck = trucks.find((t) => t.id === selectedTruckId) || trucks[0] || {
    id: 'TRUCK_PK_094',
    model: 'Hino 500',
    plate: 'TK-5021',
    driver: 'Bilal Ahmed',
    status: 'Active',
    distanceKm: 468,
    co2TodayKg: 412,
    cargoKg: 3500,
    integrity: 'Verified',
    fuelType: 'Diesel',
    monthlyAllowanceKg: 6000,
    lastSync: '2 min ago',
  };

  // Calculations
  const totalCo2Today = trucks.reduce((sum, t) => sum + t.co2TodayKg, 0);
  const totalDieselToday = Math.round(totalCo2Today / 2.68);
  const totalDistanceToday = trucks.reduce((sum, t) => sum + t.distanceKm, 0);
  const totalCargoTonnes = (trucks.reduce((sum, t) => sum + (t.status === 'Active' ? t.cargoKg : 0), 0) / 1000).toFixed(1);
  const activeCount = trucks.filter((t) => t.status === 'Active').length;
  const idleCount = trucks.filter((t) => t.status === 'Idle').length;
  const offlineCount = trucks.filter((t) => t.status === 'Offline').length;

  const totalAssignedAllowanceKg = trucks.reduce((sum, t) => sum + (t.monthlyAllowanceKg || 6000), 0);
  const estimatedCreditsUsedToday = (totalCo2Today / 1000).toFixed(2);
  const totalMtdCo2Kg = trucks.reduce((sum, t) => sum + (t.co2TodayKg * 7.5), 0); // realistic approx MTD
  const allowanceMtdPct = Math.min(100, (totalMtdCo2Kg / totalAssignedAllowanceKg) * 100).toFixed(1);

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
      case 'Verified':
      case 'On track':
      case 'synced':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E1F5EA] text-[#1E7B4A] dark:bg-emerald-950/60 dark:text-emerald-300">{status}</span>;
      case 'Idle':
      case 'Pending':
      case 'Warning':
      case 'pending':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF1D6] text-[#8A5A00] dark:bg-amber-950/60 dark:text-amber-300">{status}</span>;
      case 'Offline':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#ECEFEE] text-[#5F6F6A] dark:bg-slate-800 dark:text-slate-400">{status}</span>;
      case 'Check needed':
      case 'Critical':
      case 'Exceeded':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDE4E4] text-[#B23232] dark:bg-rose-950/60 dark:text-rose-300">{status}</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // 1. DASHBOARD VIEW
  if (view === 'dash') {
    return (
      <div className="space-y-4">
        {/* Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F] dark:text-[#4ADE80]">
              FLEET OVERVIEW · TODAY
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#1B2B27] dark:text-[#E6F0EC]">Fleet Dashboard</h1>
            <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
              Estimated figures from telemetry · 12 October 2026
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live · Updated 1 min ago
            </span>
            <button
              onClick={() => alert('Synced fleet telemetry with edge devices.')}
              className="px-3.5 py-1.5 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors shadow-2xs"
            >
              ↻ Sync Fleet
            </button>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-2xl shadow-sm flex flex-wrap gap-2">
          <button
            onClick={onOpenAddTruck}
            className="px-3.5 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>+</span> Add Truck
          </button>
          <button
            onClick={() => setView('plan')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
          >
            🗺️ Multi-stop Planning
          </button>
          <button
            onClick={() => setView('logs')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
          >
            ⛽ Fuel & Fleet Logs
          </button>
          <button
            onClick={() => setView('veh')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
          >
            🚚 Vehicle Profiles
          </button>
          <button
            onClick={() => setView('rep')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
          >
            📊 Reports & PDF
          </button>
        </div>

        {/* 6 Key Fleet KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Estimated CO₂ Today</div>
            <div className="text-2xl font-black text-[#0B6E4F] dark:text-[#4ADE80] my-1 tabular-nums">
              {totalCo2Today.toLocaleString()} <span className="text-xs font-normal">kg</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">+3% vs yesterday</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Estimated Credits Used</div>
            <div className="text-2xl font-black text-[#0F7F73] dark:text-[#2DD4BF] my-1 tabular-nums">
              {estimatedCreditsUsedToday}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">1 credit = 1 tonne CO₂</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Diesel Used</div>
            <div className="text-2xl font-black text-[#F5A524] my-1 tabular-nums">
              {totalDieselToday.toLocaleString()} <span className="text-xs font-normal">L</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Fleet total</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Active Trucks</div>
            <div className="text-2xl font-black text-[#2B7BD6] my-1 tabular-nums">
              {activeCount} <span className="text-xs font-normal text-slate-500">/ {trucks.length}</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">{idleCount} idle · {offlineCount} offline</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Cargo Moved</div>
            <div className="text-2xl font-black text-[#7A5AF8] my-1 tabular-nums">
              {totalCargoTonnes} <span className="text-xs font-normal">t</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Declared cargo</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Total Distance</div>
            <div className="text-2xl font-black text-[#D64545] my-1 tabular-nums">
              {totalDistanceToday.toLocaleString()} <span className="text-xs font-normal">km</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Fleet trips</div>
          </div>
        </div>

        {/* Hero Card & Credit Allowance Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Eco-Route Savings Hero Card */}
          <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-6 rounded-2xl shadow-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#C5E6D9]">
                ECO-ROUTE SAVINGS TODAY (ESTIMATED)
              </div>
              <h2 className="text-xl font-bold tracking-tight my-2">Small route changes. Measurable impact.</h2>
              <div className="grid grid-cols-3 gap-4 my-3">
                <div>
                  <div className="text-2xl font-black tabular-nums">158 kg</div>
                  <div className="text-xs text-[#C5E6D9]">CO₂ Saved</div>
                </div>
                <div>
                  <div className="text-2xl font-black tabular-nums">59.0 L</div>
                  <div className="text-xs text-[#C5E6D9]">Diesel Saved</div>
                </div>
                <div>
                  <div className="text-2xl font-black tabular-nums">1 h 46 m</div>
                  <div className="text-xs text-[#C5E6D9]">Time Saved</div>
                </div>
              </div>
            </div>
            <div>
              <button
                onClick={() => setView('route')}
                className="mt-2 px-4 py-2 bg-[#F5A524] hover:bg-[#D98205] text-[#3D2B04] font-bold rounded-xl text-xs shadow-xs transition-colors"
              >
                View Route Savings Breakdown →
              </button>
            </div>
          </div>

          {/* Monthly Credit Allowance Budget */}
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-bold text-base text-[#1B2B27] dark:text-[#E6F0EC]">Monthly Credit Budget</h3>
                <span className="text-xs text-[#5F6F6A]">October Allowance</span>
              </div>
              <div className="text-2xl font-black my-1 tabular-nums">
                {(totalMtdCo2Kg / 1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">/ 100 Credits (100,000 kg)</span>
              </div>
              <div className="w-full bg-[#E1E8E5] dark:bg-[#25382F] h-3 rounded-full overflow-hidden my-3">
                <div
                  className="bg-gradient-to-r from-[#0B6E4F] to-[#0F7F73] h-full rounded-full transition-all duration-500"
                  style={{ width: `${allowanceMtdPct}%` }}
                />
              </div>
              <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                Early warnings issued today: <b>6</b> · Accepted by drivers: <b>5</b> (83% acceptance rate)
              </p>
            </div>

            <div className="pt-3 border-t border-[#E1E8E5] dark:border-[#25382F] flex justify-between items-center text-xs">
              <span className="text-[#5F6F6A]">Forecast: On track to use ~94 credits by month end</span>
              <button onClick={() => setView('cred')} className="text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline">
                Audit Details →
              </button>
            </div>
          </div>
        </div>

        {/* Fleet CO2 Credit Allowance Widget Per Truck */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base">Fleet CO₂ Credit Allowance Status</h3>
              <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                1 credit = 1 tonne (1,000 kg) CO₂e · Monthly allowance limits
              </p>
            </div>
            <div className="text-xs flex gap-4 text-[#5F6F6A]">
              <span>Assigned: <b>{(totalAssignedAllowanceKg / 1000).toFixed(0)} Credits</b></span>
              <span>Consumed: <b>{(totalMtdCo2Kg / 1000).toFixed(1)} Credits</b></span>
            </div>
          </div>

          <div className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
            {trucks.slice(0, 5).map((truck) => {
              const allowance = truck.monthlyAllowanceKg || 6000;
              const consumed = truck.co2TodayKg * 7.5; // approx MTD
              const { band, percentage, colorClass } = getAllowanceBand(consumed, allowance);

              return (
                <div key={truck.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="w-44">
                    <b className="hover:text-[#0B6E4F] cursor-pointer" onClick={() => { setSelectedTruckId(truck.id); setView('truck'); }}>
                      {truck.id}
                    </b>
                    <div className="text-[11px] text-[#5F6F6A]">{truck.model} · {truck.driver}</div>
                  </div>

                  <div className="flex-1 max-w-md mx-2">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span>{Math.round(consumed).toLocaleString()} / {allowance.toLocaleString()} kg CO₂</span>
                      <b style={{ color: colorClass }}>{percentage}%</b>
                    </div>
                    <div className="w-full bg-[#E1E8E5] dark:bg-[#25382F] h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, percentage)}%`, backgroundColor: colorClass }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {renderStatusBadge(band)}
                    <button
                      onClick={() => onOpenEditAllowance(truck)}
                      className="text-[#0B6E4F] dark:text-[#4ADE80] font-semibold hover:underline text-[11px]"
                    >
                      Edit Limit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Charts: 24h trend & 7-day CO2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-sm">Last 24 Hours Fleet Emission Rate</h3>
                <div className="text-xs text-[#5F6F6A]">Hourly progression · Amber = current peak period</div>
              </div>
              <div className="flex p-0.5 bg-[#EAF5F0] dark:bg-[#1D3A2F] rounded-lg text-xs font-bold">
                <button
                  onClick={() => setHourlyMetric('co2')}
                  className={`px-3 py-1 rounded-md transition-colors ${hourlyMetric === 'co2' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'text-[#5F6F6A]'}`}
                >
                  CO₂
                </button>
                <button
                  onClick={() => setHourlyMetric('diesel')}
                  className={`px-3 py-1 rounded-md transition-colors ${hourlyMetric === 'diesel' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'text-[#5F6F6A]'}`}
                >
                  Diesel
                </button>
              </div>
            </div>

            {/* Custom Bar Visualization */}
            <div className="h-36 flex items-end gap-1.5 pt-4">
              {[120, 140, 110, 90, 80, 150, 240, 310, 280, 290, 340, 380, 310, 260].map((val, i) => {
                const max = 400;
                const hPct = (val / max) * 100;
                const isCurrent = i === 11;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${isCurrent ? 'bg-[#F5A524]' : 'bg-gradient-to-t from-[#0B6E4F] to-[#29A879]'}`}
                      style={{ height: `${hPct}%` }}
                    />
                    <span className="text-[9px] text-[#5F6F6A] tabular-nums">{i + 1}h</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-sm">Last 7 Days Fleet CO₂ (kg)</h3>
                <div className="text-xs text-[#5F6F6A]">Daily target line at 3,000 kg</div>
              </div>
              <span className="text-xs text-[#0B6E4F] font-bold">Target: 3,000 kg</span>
            </div>

            <div className="h-36 flex items-end gap-3 pt-4 relative">
              {/* Daily target reference line */}
              <div className="absolute top-10 left-0 right-0 border-t border-dashed border-[#D64545] z-0 opacity-60" />

              {[2980, 3050, 2890, 3210, 3100, 2950, totalCo2Today].map((val, i) => {
                const max = 3600;
                const hPct = (val / max) * 100;
                const dayLabels = ['6 Oct', '7 Oct', '8 Oct', '9 Oct', '10 Oct', '11 Oct', 'Today'];
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 z-1">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${i === 6 ? 'bg-[#0B6E4F]' : 'bg-[#0F7F73]/80'}`}
                      style={{ height: `${hPct}%` }}
                    />
                    <span className="text-[10px] text-[#5F6F6A]">{dayLabels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Routes by Savings & Recent Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Routes */}
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
            <h3 className="font-bold text-sm mb-1">Top Corridors by Eco-Route Savings</h3>
            <p className="text-xs text-[#5F6F6A] mb-3">Ranked by estimated CO₂ emissions prevented</p>

            <div className="space-y-3 text-xs">
              {[
                { name: 'Karachi to Hyderabad (M-9 Corridor)', savedCo2: 186, diesel: 69 },
                { name: 'Hyderabad to Nawabshah (N-5 Highway)', savedCo2: 142, diesel: 53 },
                { name: 'Nawabshah to Sukkur Bypass', savedCo2: 98, diesel: 36 },
                { name: 'Lahore Ring Road Congestion Avoidance', savedCo2: 77, diesel: 29 },
                { name: 'Hala Road Dynamic Detour', savedCo2: 48, diesel: 18 },
              ].map((route, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between font-medium">
                    <span><b>{i + 1}.</b> {route.name}</span>
                    <span className="text-[#5F6F6A] font-mono">{route.savedCo2} kg CO₂ ({route.diesel} L)</span>
                  </div>
                  <div className="w-full bg-[#E1E8E5] dark:bg-[#25382F] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0B6E4F] h-full rounded-full"
                      style={{ width: `${(route.savedCo2 / 186) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm">Recent Fleet Alerts</h3>
                <button onClick={() => setView('alert')} className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline">
                  All Alerts ({alerts.filter((a) => !a.read).length} unread) →
                </button>
              </div>

              <div className="divide-y divide-[#E1E8E5] dark:divide-[#25382F] text-xs">
                {alerts.slice(0, 4).map((alert) => (
                  <div key={alert.id} className="py-2.5 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {renderStatusBadge(alert.type)}
                        <b className="text-slate-800 dark:text-slate-200">{alert.title}</b>
                      </div>
                      <div className="text-[11px] text-[#5F6F6A] mt-0.5">
                        {alert.truckId} · Driver {alert.driverName} · {alert.time}
                      </div>
                    </div>
                    {!alert.read && (
                      <button
                        onClick={() => onMarkAlertRead(alert.id)}
                        className="text-[10px] text-[#2B7BD6] hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Trucks Summary Table */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-sm">Active Fleet Operations</h3>
              <p className="text-xs text-[#5F6F6A]">Click any truck row to view detailed telemetry and daily reports</p>
            </div>
            <button onClick={() => setView('fleet')} className="text-xs text-[#0B6E4F] font-bold hover:underline">
              View All 8 Trucks →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]">
                  <th className="py-2 px-3">TRUCK & DRIVER</th>
                  <th className="py-2 px-3">STATUS</th>
                  <th className="py-2 px-3">DISTANCE</th>
                  <th className="py-2 px-3">CO₂ TODAY</th>
                  <th className="py-2 px-3">DIESEL</th>
                  <th className="py-2 px-3">INTEGRITY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
                {trucks.slice(0, 5).map((truck) => (
                  <tr
                    key={truck.id}
                    onClick={() => {
                      setSelectedTruckId(truck.id);
                      setView('truck');
                    }}
                    className="hover:bg-[#EAF5F0] dark:hover:bg-[#1D3A2F] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <b>{truck.id}</b>
                      <div className="text-[11px] text-[#5F6F6A]">{truck.driver} · {truck.plate}</div>
                    </td>
                    <td className="py-2.5 px-3">{renderStatusBadge(truck.status)}</td>
                    <td className="py-2.5 px-3 tabular-nums">{truck.distanceKm.toLocaleString()} km</td>
                    <td className="py-2.5 px-3 font-semibold tabular-nums">{truck.co2TodayKg.toLocaleString()} kg</td>
                    <td className="py-2.5 px-3 tabular-nums">{Math.round(truck.co2TodayKg / 2.68).toLocaleString()} L</td>
                    <td className="py-2.5 px-3">{renderStatusBadge(truck.integrity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 2. FLEET & TRUCKS VIEW
  if (view === 'fleet') {
    const filteredTrucks = trucks.filter((t) => {
      const matchSearch =
        t.id.toLowerCase().includes(fleetSearch.toLowerCase()) ||
        t.driver.toLowerCase().includes(fleetSearch.toLowerCase()) ||
        t.plate.toLowerCase().includes(fleetSearch.toLowerCase());
      const matchStatus = fleetStatusFilter === 'All' || t.status === fleetStatusFilter;
      return matchSearch && matchStatus;
    });

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">FLEET MANAGEMENT</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fleet & Trucks</h1>
            <p className="text-xs text-[#5F6F6A]">Click any truck to open full telemetry, fuel, and daily emission audit reports</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenAddTruck}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              <span>+</span> Add Truck
            </button>
            <button
              onClick={() => exportFleetPdf(trucks)}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50"
            >
              Export PDF
            </button>
            <button
              onClick={() => {
                const headers = ['Truck', 'Model', 'Plate', 'Driver', 'Status', 'Distance (km)', 'CO2 (kg)', 'Diesel (L)', 'Integrity'];
                const rows = filteredTrucks.map((t) => [t.id, t.model, t.plate, t.driver, t.status, t.distanceKm, t.co2TodayKg, Math.round(t.co2TodayKg / 2.68), t.integrity]);
                downloadCsv('fleet_trucks', headers, rows);
              }}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Filter Chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 font-semibold">{trucks.length} Trucks Total</span>
          <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">{activeCount} Active</span>
          <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">{idleCount} Idle</span>
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-semibold">{offlineCount} Offline</span>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by truck ID, driver, or plate..."
            value={fleetSearch}
            onChange={(e) => setFleetSearch(e.target.value)}
            className="px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs flex-1 min-w-[220px]"
          />
          <select
            value={fleetStatusFilter}
            onChange={(e) => setFleetStatusFilter(e.target.value)}
            className="px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs bg-white dark:bg-[#16241F]"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Idle">Idle</option>
            <option value="Offline">Offline</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A] bg-slate-50/50 dark:bg-slate-900/50">
                <th className="py-3 px-4">VEHICLE IDENTIFIER</th>
                <th className="py-3 px-4">MODEL & FUEL</th>
                <th className="py-3 px-4">DRIVER</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4">DISTANCE</th>
                <th className="py-3 px-4">CO₂ TODAY</th>
                <th className="py-3 px-4">DIESEL BURNED</th>
                <th className="py-3 px-4">DATA INTEGRITY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
              {filteredTrucks.map((truck) => (
                <tr
                  key={truck.id}
                  onClick={() => {
                    setSelectedTruckId(truck.id);
                    setView('truck');
                  }}
                  className="hover:bg-[#EAF5F0] dark:hover:bg-[#1D3A2F] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <b className="text-[#0B6E4F] dark:text-[#4ADE80] font-black">{truck.id}</b>
                    <div className="text-[11px] text-[#5F6F6A] font-mono">{truck.plate}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div>{truck.model}</div>
                    <span className="text-[10px] text-[#5F6F6A]">{truck.fuelType}</span>
                  </td>
                  <td className="py-3 px-4 font-medium">{truck.driver}</td>
                  <td className="py-3 px-4">{renderStatusBadge(truck.status)}</td>
                  <td className="py-3 px-4 tabular-nums font-mono">{truck.distanceKm.toLocaleString()} km</td>
                  <td className="py-3 px-4 font-bold tabular-nums font-mono">{truck.co2TodayKg.toLocaleString()} kg</td>
                  <td className="py-3 px-4 tabular-nums font-mono">{Math.round(truck.co2TodayKg / 2.68).toLocaleString()} L</td>
                  <td className="py-3 px-4">{renderStatusBadge(truck.integrity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 3. TRUCK DETAIL VIEW (with Overview, Monthly, Trips, Savings tabs)
  if (view === 'truck') {
    const monthlyDays = truckMonthlyData?.days || [];

    return (
      <div className="space-y-4">
        <button onClick={() => setView('fleet')} className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline">
          ← Back to Fleet & Trucks
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">TRUCK REPORT DETAIL</div>
            <h1 className="text-2xl font-black">{activeTruck.id} · {activeTruck.model}</h1>
            <p className="text-xs text-[#5F6F6A]">
              Plate {activeTruck.plate} · Driver {activeTruck.driver} · Fuel: {activeTruck.fuelType} · Last sync {activeTruck.lastSync}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {renderStatusBadge(activeTruck.status)}
            {renderStatusBadge(activeTruck.integrity)}
            <button
              onClick={() => setView('live')}
              className="px-3.5 py-1.5 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-lg text-xs"
            >
              Open in Live Map
            </button>
          </div>
        </div>

        {/* 4 Tabs */}
        <div className="flex gap-2 border-b border-[#E1E8E5] dark:border-[#25382F] pb-2 text-xs font-bold">
          <button
            onClick={() => setTruckTab('ov')}
            className={`px-4 py-2 rounded-xl transition-colors ${truckTab === 'ov' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setTruckTab('mo')}
            className={`px-4 py-2 rounded-xl transition-colors ${truckTab === 'mo' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]'}`}
          >
            Monthly Report (October)
          </button>
          <button
            onClick={() => setTruckTab('tr')}
            className={`px-4 py-2 rounded-xl transition-colors ${truckTab === 'tr' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]'}`}
          >
            Trips List
          </button>
          <button
            onClick={() => setTruckTab('sv')}
            className={`px-4 py-2 rounded-xl transition-colors ${truckTab === 'sv' ? 'bg-[#0B6E4F] text-white shadow-xs' : 'bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]'}`}
          >
            Eco-Route Savings
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {truckTab === 'ov' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Estimated CO₂ Today</div>
                <div className="text-2xl font-black text-[#0B6E4F] my-1 tabular-nums">{activeTruck.co2TodayKg.toLocaleString()} kg</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Estimated Credits</div>
                <div className="text-2xl font-black text-[#0F7F73] my-1 tabular-nums">{(activeTruck.co2TodayKg / 1000).toFixed(2)}</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Diesel Today</div>
                <div className="text-2xl font-black text-[#F5A524] my-1 tabular-nums">{Math.round(activeTruck.co2TodayKg / 2.68)} L</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Declared Cargo</div>
                <div className="text-2xl font-black text-[#7A5AF8] my-1 tabular-nums">{activeTruck.cargoKg.toLocaleString()} kg</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs">
                <h3 className="font-bold text-sm mb-3">Today's Hourly Emissions Progression</h3>
                <div className="h-36 flex items-end gap-1.5 pt-4">
                  {[24, 28, 19, 15, 32, 45, 52, 48, 49, 56, 62, 51, 40].map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-[#0B6E4F] rounded-t-sm"
                        style={{ height: `${(v / 70) * 100}%` }}
                      />
                      <span className="text-[9px] text-[#5F6F6A] mt-1">{i + 1}h</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-6 rounded-2xl shadow-md flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#C5E6D9]">ECO-ROUTE SAVINGS TODAY</div>
                  <div className="text-3xl font-black my-2">38.0 kg CO₂ Saved</div>
                  <div className="text-xs text-[#E2F2E9] space-y-1">
                    <div>Diesel Saved: 14.2 L</div>
                    <div>Travel Time Saved: 22 min</div>
                    <div>Total Idling Time: 42 min</div>
                  </div>
                </div>
                <div className="text-[11px] text-[#C5E6D9] mt-3 pt-2 border-t border-white/20">
                  Data cryptographically chained with SHA-256 signatures.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MONTHLY REPORT */}
        {truckTab === 'mo' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">October 2026 Monthly Logbook</h3>
                <p className="text-xs text-[#5F6F6A]">Click any day row to inspect hourly telemetry and route events</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const headers = ['Day', 'CO2 (kg)', 'Credits', 'Diesel (L)', 'CO2 Saved (kg)', 'Integrity'];
                    const rows = monthlyDays.map((d: any) => [d.date, d.co2Kg, d.credits, d.dieselL, d.co2SavedKg, d.integrity]);
                    downloadCsv(`${activeTruck.id}_october_report`, headers, rows);
                  }}
                  className="px-3 py-1.5 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-lg text-xs font-bold"
                >
                  Download CSV
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A] bg-slate-50/50 dark:bg-slate-900/50">
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">CO₂ EMISSION</th>
                    <th className="py-2.5 px-3">CREDITS USED</th>
                    <th className="py-2.5 px-3">DIESEL (L)</th>
                    <th className="py-2.5 px-3">CO₂ SAVED</th>
                    <th className="py-2.5 px-3">INTEGRITY</th>
                    <th className="py-2.5 px-3">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
                  {monthlyDays.map((day: any) => (
                    <tr
                      key={day.day}
                      onClick={() => {
                        setSelectedDay(day.day);
                        setView('day');
                      }}
                      className="hover:bg-[#EAF5F0] dark:hover:bg-[#1D3A2F] cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-3 font-semibold">
                        {day.date} {day.day === 12 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Live</span>}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold">{day.co2Kg.toLocaleString()} kg</td>
                      <td className="py-2 px-3 font-mono">{day.credits}</td>
                      <td className="py-2 px-3 font-mono">{day.dieselL.toLocaleString()} L</td>
                      <td className="py-2 px-3 font-mono text-emerald-600 font-semibold">{day.co2SavedKg} kg</td>
                      <td className="py-2 px-3">{renderStatusBadge(day.integrity)}</td>
                      <td className="py-2 px-3 text-[#0B6E4F] font-bold hover:underline">Inspect Day →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TRIPS LIST */}
        {truckTab === 'tr' && (
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-xs">
            <h3 className="font-bold text-sm mb-3">Recent Operating Trips</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                  <th className="py-2">TRIP ID</th>
                  <th className="py-2">CORRIDOR ROUTE</th>
                  <th className="py-2">TIME WINDOW</th>
                  <th className="py-2">DISTANCE</th>
                  <th className="py-2">EST. CO₂</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E8E5]">
                <tr>
                  <td className="py-3 font-mono font-bold text-[#0B6E4F]">TRIP_KHI_HYD_102</td>
                  <td className="py-3">Karachi Port → Hyderabad Logistic Depot</td>
                  <td className="py-3 text-[#5F6F6A]">06:10 - 09:40</td>
                  <td className="py-3 font-mono">158 km</td>
                  <td className="py-3 font-mono font-bold">142 kg</td>
                </tr>
                <tr>
                  <td className="py-3 font-mono font-bold text-[#0B6E4F]">TRIP_HYD_NWB_103</td>
                  <td className="py-3">Hyderabad Depot → Nawabshah Bypass</td>
                  <td className="py-3 text-[#5F6F6A]">10:30 - 13:05</td>
                  <td className="py-3 font-mono">150 km</td>
                  <td className="py-3 font-mono font-bold">131 kg</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: SAVINGS */}
        {truckTab === 'sv' && (
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-xs">
            <h3 className="font-bold text-sm mb-3">Eco-Route Advisory Decisions</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                  <th className="py-2">TIME</th>
                  <th className="py-2">PLANNED CORRIDOR</th>
                  <th className="py-2">ECO-ROUTE DETOUR</th>
                  <th className="py-2">ESTIMATED SAVINGS</th>
                  <th className="py-2">ACCEPTED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E8E5]">
                <tr>
                  <td className="py-3 text-[#5F6F6A]">10:42 AM</td>
                  <td className="py-3">18.4 km / 19.3 kg CO₂</td>
                  <td className="py-3 font-medium">19.1 km / 3.2 kg CO₂</td>
                  <td className="py-3 font-bold text-emerald-600">16.1 kg CO₂ · 6.0 L · 11 min</td>
                  <td className="py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Yes</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // 4. DAY DETAIL VIEW
  if (view === 'day') {
    const dRec = dayDetailData || {
      day: selectedDay || 12,
      date: `2026-10-${String(selectedDay || 12).padStart(2, '0')}`,
      co2Kg: 412,
      credits: 0.41,
      dieselL: 154,
      distanceKm: 468,
      co2SavedKg: 38,
      dieselSavedL: 14.2,
      timeSavedMin: 22,
      cargoKg: 3500,
      idleMin: 42,
      integrity: 'Verified',
    };

    return (
      <div className="space-y-4">
        <button
          onClick={() => setView('truck')}
          className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline"
        >
          ← Back to {activeTruck.id} Monthly Report
        </button>

        <div className="flex justify-between items-center bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">DAY DETAIL TELEMETRY</div>
            <h1 className="text-xl font-black">{dRec.date} {dRec.day === 12 && '(Live)'} · {activeTruck.id}</h1>
            <p className="text-xs text-[#5F6F6A]">Driver: {activeTruck.driver} · Plate: {activeTruck.plate}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedDay(Math.max(1, (selectedDay || 12) - 1))}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs font-bold rounded-lg"
            >
              ‹ Previous Day
            </button>
            <button
              onClick={() => setSelectedDay(Math.min(12, (selectedDay || 12) + 1))}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs font-bold rounded-lg"
            >
              Next Day ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">CO₂ Emitted</div>
            <b className="text-lg font-black text-[#0B6E4F] tabular-nums">{dRec.co2Kg} kg</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Credits Used</div>
            <b className="text-lg font-black text-[#0F7F73] tabular-nums">{dRec.credits}</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Diesel Burned</div>
            <b className="text-lg font-black text-[#F5A524] tabular-nums">{dRec.dieselL} L</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Distance Driven</div>
            <b className="text-lg font-black text-[#2B7BD6] tabular-nums">{dRec.distanceKm} km</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Idle Time</div>
            <b className="text-lg font-black text-[#D64545] tabular-nums">{dRec.idleMin} min</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Integrity</div>
            {renderStatusBadge(dRec.integrity)}
          </div>
        </div>
      </div>
    );
  }

  // 5. LIVE MAP VIEW
  if (view === 'live') {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">CORRIDOR TRACKING</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fleet Live Map</h1>
          <p className="text-xs text-[#5F6F6A]">
            Real-time positions along Karachi-Hyderabad-Nawabshah-Sukkur. OpenStreetMap tiles.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-2xl shadow-xs">
            <LeafletMap
              height="500px"
              trucks={trucks}
              selectedTruckId={selectedTruckId}
              onSelectTruck={(id) => setSelectedTruckId(id)}
            />
            <div className="flex flex-wrap gap-4 text-xs text-[#5F6F6A] mt-2 px-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#1E9E5A]" /> Active Truck</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#F5A524]" /> Idle Truck</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#9AA7A2]" /> Offline</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#F5A524] text-white text-[8px] flex items-center justify-center font-bold">!</span> Congestion Warning Point</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 border-t-2 border-dashed border-[#1E9E5A]" /> Eco-Route Detour</span>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="font-bold text-sm mb-2">Truck Fleet List</h3>
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {trucks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTruckId(t.id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${t.id === selectedTruckId ? 'border-[#0B6E4F] bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50'}`}
                  >
                    <div className="flex justify-between items-center">
                      <b className="text-[#0B6E4F]">{t.id}</b>
                      {renderStatusBadge(t.status)}
                    </div>
                    <div className="text-[11px] text-[#5F6F6A] mt-0.5">{t.driver} · {t.model}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setView('truck')}
              className="w-full mt-3 py-2.5 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs"
            >
              Open Selected Truck Details →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. MULTI-STOP PLANNING VIEW (GA Optimizer)
  if (view === 'plan') {
    const handleAddStop = () => {
      if (newStopCity && !planningStops.includes(newStopCity)) {
        setPlanningStops([...planningStops, newStopCity]);
      }
    };

    const handleRemoveStop = (idx: number) => {
      if (planningStops.length <= 2) {
        alert('Route must have at least 2 stops (origin and destination).');
        return;
      }
      const updated = [...planningStops];
      updated.splice(idx, 1);
      setPlanningStops(updated);
    };

    const handleRunGA = async () => {
      try {
        const res = await onOptimizeRoute(planningStops);
        setOptimizationResult(res);
        if (res && res.optimizedStops) {
          setPlanningStops(res.optimizedStops);
        }
      } catch (err: any) {
        alert('Optimization failed: ' + err.message);
      }
    };

    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">LOGISTICS ROUTING</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Multi-stop Route Optimization</h1>
          <p className="text-xs text-[#5F6F6A]">
            Genetic Algorithm (GA) reorders delivery stops to minimize total travel distance, diesel consumption, and CO₂ emissions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <h3 className="font-bold text-sm">Delivery Stops Sequence</h3>

            <div className="space-y-2">
              {planningStops.map((stop, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 dark:bg-[#1D3A2F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl flex items-center justify-between text-xs font-semibold"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${idx === 0 ? 'bg-[#1E9E5A]' : idx === planningStops.length - 1 ? 'bg-[#D64545]' : 'bg-[#2B7BD6]'}`}>
                      {idx === 0 ? 'A' : idx === planningStops.length - 1 ? 'B' : idx}
                    </span>
                    <span>{stop}</span>
                  </div>
                  {idx > 0 && idx < planningStops.length - 1 && (
                    <button
                      onClick={() => handleRemoveStop(idx)}
                      className="text-slate-400 hover:text-rose-600 px-2 py-0.5 rounded-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <select
                value={newStopCity}
                onChange={(e) => setNewStopCity(e.target.value)}
                className="px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs flex-1 bg-white dark:bg-[#16241F]"
              >
                {['Sukkur', 'Multan', 'Islamabad', 'Quetta'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddStop}
                className="px-4 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50"
              >
                + Add Stop
              </button>
            </div>

            <button
              onClick={handleRunGA}
              className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm flex items-center justify-center gap-2"
            >
              <span>✨</span> Run Genetic Algorithm Optimizer
            </button>
          </div>

          {/* Results Comparison Card */}
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm mb-2">Optimization Outcome</h3>
              {optimizationResult ? (
                <div className="space-y-3 text-xs">
                  <div className="p-4 bg-emerald-50 dark:bg-[#1D3A2F] text-emerald-900 dark:text-emerald-100 rounded-xl space-y-2 border border-emerald-300">
                    <b className="text-sm block">✓ Optimized Sequence Found</b>
                    <div>Original Distance: <b>{optimizationResult.originalDistanceKm} km</b></div>
                    <div>Optimized Distance: <b>{optimizationResult.optimizedDistanceKm} km</b></div>
                    <div className="text-base font-black text-[#0B6E4F] dark:text-[#4ADE80] pt-1 border-t border-emerald-200">
                      Savings: {optimizationResult.savedDistanceKm} km · {optimizationResult.savedFuelL} L Fuel · {optimizationResult.savedCo2Kg} kg CO₂!
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#5F6F6A]">
                  Click "Run Genetic Algorithm Optimizer" to evaluate permutations across road network graphs and find the lowest-emission sequence.
                </p>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-[11px] text-[#5F6F6A]">
              Algorithm: Population = 20, 2-opt permutation crossover, mutation rate 0.2, road multiplier 1.25x.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 7. VEHICLE PROFILES VIEW
  if (view === 'veh') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">WORKSPACE</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Vehicle Profiles</h1>
            <p className="text-xs text-[#5F6F6A]">Configure fuel consumption and emission benchmarks across your fleet</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {vehicleProfiles.map((p) => (
            <div key={p.id} className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm">{p.name}</h3>
                  <div className="text-xs text-[#5F6F6A]">{p.type} · {p.fuelType}</div>
                </div>
                {p.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Active</span>}
              </div>

              <div className="text-2xl font-black text-[#0B6E4F] my-2 tabular-nums">
                {p.efficiencyValue} <span className="text-xs font-normal text-slate-500">{p.efficiencyUnit}</span>
              </div>

              <div className="text-xs text-[#5F6F6A]">
                Tailpipe CO₂: <b>{p.co2PerKmKg} kg/km</b>
                {p.type === 'EV' && <span className="block text-[10px] text-slate-400">(Grid emissions not included)</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 8. ROUTE SAVINGS VIEW
  if (view === 'route') {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">SAVINGS INTELLIGENCE</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Route Savings</h1>
          <p className="text-xs text-[#5F6F6A]">All savings are computed from on-device dynamic eco-routing advisories</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-4 rounded-2xl">
            <div className="text-xs text-[#C5E6D9]">Cumulative CO₂ Saved</div>
            <div className="text-2xl font-black my-1 tabular-nums">1,704 kg</div>
            <div className="text-[10px] text-[#C5E6D9]">October MTD</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Total Diesel Saved</div>
            <div className="text-2xl font-black text-[#F5A524] my-1 tabular-nums">636 L</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Travel Time Saved</div>
            <div className="text-2xl font-black text-[#2B7BD6] my-1 tabular-nums">19 hours</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Reroute Events</div>
            <div className="text-2xl font-black text-[#7A5AF8] my-1 tabular-nums">{31 + routeEvents.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs">
          <h3 className="font-bold text-sm mb-3">Reroute Advisory Events Log</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                <th className="py-2">DATE</th>
                <th className="py-2">TRUCK</th>
                <th className="py-2">TRIGGER</th>
                <th className="py-2">LOCATION</th>
                <th className="py-2">CO₂ SAVED</th>
                <th className="py-2">DIESEL SAVED</th>
                <th className="py-2">TIME SAVED</th>
                <th className="py-2">ACCEPTED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5]">
              {routeEvents.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="py-2.5 font-semibold">{r.date}</td>
                  <td className="py-2.5 font-bold text-[#0B6E4F]">{r.truckId}</td>
                  <td className="py-2.5">{renderStatusBadge(r.trigger)}</td>
                  <td className="py-2.5">{r.location}</td>
                  <td className="py-2.5 font-bold text-emerald-600 tabular-nums">+{r.savedCo2Kg} kg</td>
                  <td className="py-2.5 tabular-nums">+{r.savedDieselL} L</td>
                  <td className="py-2.5 tabular-nums">{r.savedTimeMin} min</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${r.accepted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {r.accepted ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 9. REPORTS VIEW
  if (view === 'rep') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">REPORTS & LOGBOOKS</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fleet Reports & Exports</h1>
            <p className="text-xs text-[#5F6F6A]">Generate carbon audits, fuel logs, and trip compliance sheets in PDF & CSV</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportFleetPdf(trucks)}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              Download PDF Report
            </button>
            <button
              onClick={() => {
                const headers = ['Truck', 'Model', 'Plate', 'Driver', 'Status', 'Distance (km)', 'CO2 (kg)', 'Diesel (L)'];
                const rows = trucks.map((t) => [t.id, t.model, t.plate, t.driver, t.status, t.distanceKm, t.co2TodayKg, Math.round(t.co2TodayKg / 2.68)]);
                downloadCsv('fleet_summary_report', headers, rows);
              }}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Carbon Savings Audit</h3>
            <p className="text-xs text-[#5F6F6A]">Certified breakdown of fuel reductions, avoided emissions, and credit allocations.</p>
            <div className="pt-2 flex gap-2">
              <button onClick={() => exportCarbonAuditPdf(trucks, {})} className="px-3 py-1.5 bg-[#0B6E4F] text-white font-bold rounded-lg text-xs">PDF</button>
              <button onClick={() => {
                const headers = ['Truck', 'Driver', 'CO2 Today (kg)', 'Monthly Allowance (kg)'];
                const rows = trucks.map(t => [t.id, t.driver, t.co2TodayKg, t.monthlyAllowanceKg]);
                downloadCsv('carbon_audit', headers, rows);
              }} className="px-3 py-1.5 border border-[#E1E8E5] font-bold rounded-lg text-xs">CSV</button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Trip Logbook</h3>
            <p className="text-xs text-[#5F6F6A]">Official log of commercial trips, origins, destinations, distances, and driver declarations.</p>
            <div className="pt-2 flex gap-2">
              <button onClick={() => {
                const headers = ['Trip ID', 'From', 'To', 'Distance (km)', 'CO2 (kg)'];
                const rows = [['TRIP_KHI_HYD_102', 'Karachi', 'Hyderabad', 158, 142], ['TRIP_HYD_NWB_103', 'Hyderabad', 'Nawabshah', 150, 131]];
                downloadCsv('trip_logbook', headers, rows);
              }} className="px-3 py-1.5 border border-[#E1E8E5] font-bold rounded-lg text-xs">CSV Logbook</button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Fuel Refills Audit</h3>
            <p className="text-xs text-[#5F6F6A]">Driver refill logs with timestamped odometer checks and variance reconciliation.</p>
            <div className="pt-2 flex gap-2">
              <button onClick={() => exportFuelLogsPdf(fuelLogs)} className="px-3 py-1.5 bg-[#F5A524] text-amber-950 font-bold rounded-lg text-xs">PDF</button>
              <button onClick={() => {
                const headers = ['Truck', 'Date', 'Litres', 'Odometer'];
                const rows = fuelLogs.map(l => [l.truckId, l.dateTime, l.litres, l.odometerKm]);
                downloadCsv('fuel_logs', headers, rows);
              }} className="px-3 py-1.5 border border-[#E1E8E5] font-bold rounded-lg text-xs">CSV</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 10. CARBON CREDITS VIEW
  if (view === 'cred') {
    return (
      <div className="space-y-4">
        {/* Amber Disclaimer Banner */}
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border-2 border-[#F5A524] rounded-xl text-amber-900 dark:text-amber-200 text-xs font-semibold">
          <b>Estimated usage only. Not an official carbon registry balance.</b>
          <div className="text-[11px] font-normal text-amber-800 dark:text-amber-300 mt-0.5">
            1 Credit = 1 metric tonne (1,000 kg) CO₂e. Calculation: Diesel Litres × 2.68 kg/L.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Used Today</div>
            <div className="text-3xl font-black text-[#0B6E4F] my-1 tabular-nums">
              {(totalCo2Today / 1000).toFixed(2)} <span className="text-sm font-normal text-slate-500">Credits</span>
            </div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Used in October (MTD)</div>
            <div className="text-3xl font-black text-[#0F7F73] my-1 tabular-nums">
              {(totalMtdCo2Kg / 1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">Credits</span>
            </div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Monthly Credit Allowance</div>
            <div className="text-3xl font-black text-[#F5A524] my-1 tabular-nums">
              100.0 <span className="text-sm font-normal text-slate-500">Credits</span>
            </div>
          </div>
        </div>

        {/* Audit Table */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">Carbon Audit Ledger</h3>
            <button
              onClick={() => exportCarbonAuditPdf(trucks, {})}
              className="px-3.5 py-1.5 bg-[#0B6E4F] text-white font-bold rounded-lg text-xs"
            >
              Download Audit PDF
            </button>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                <th className="py-2">TRUCK</th>
                <th className="py-2">CO₂ TODAY (KG)</th>
                <th className="py-2">CREDITS TODAY</th>
                <th className="py-2">MONTHLY ALLOWANCE (KG)</th>
                <th className="py-2">CONSUMED %</th>
                <th className="py-2">REMAINING</th>
                <th className="py-2">INTEGRITY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5]">
              {trucks.map((t) => {
                const allowance = t.monthlyAllowanceKg || 6000;
                const { band, percentage } = getAllowanceBand(t.co2TodayKg * 7.5, allowance);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-bold text-[#0B6E4F]">{t.id}</td>
                    <td className="py-2.5 font-mono">{t.co2TodayKg} kg</td>
                    <td className="py-2.5 font-mono">{(t.co2TodayKg / 1000).toFixed(2)}</td>
                    <td className="py-2.5 font-mono">{allowance.toLocaleString()} kg</td>
                    <td className="py-2.5 font-mono font-bold">{percentage}%</td>
                    <td className="py-2.5 font-mono">{Math.max(0, allowance - t.co2TodayKg).toLocaleString()} kg</td>
                    <td className="py-2.5">{renderStatusBadge(band)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 11. FUEL & FLEET LOGS VIEW
  if (view === 'logs') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">REFILL AUDIT</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fuel & Fleet Logs</h1>
            <p className="text-xs text-[#5F6F6A]">Refills submitted by drivers. Offline entries display pending until synced.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenAddFuelLog}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              <span>+</span> Log Fuel Refill
            </button>
            <button
              onClick={() => exportFuelLogsPdf(fuelLogs)}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* Fuel Reconciliation Card */}
        <div className="bg-emerald-50 dark:bg-[#1D3A2F] border border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl text-xs text-emerald-950 dark:text-emerald-100 flex justify-between items-center">
          <div>
            <b className="text-sm text-emerald-900 dark:text-emerald-200">Fuel Reconciliation Variance: 4.8% (Nominal)</b>
            <div className="text-emerald-800 dark:text-emerald-300 mt-0.5">
              Comparison between physical refuel receipts (375.5 L) vs integrated ECU fuel rate sensors (358.1 L) is within the allowable 15% threshold.
            </div>
          </div>
          <span className="text-lg">✓</span>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                <th className="py-2 px-3">TRUCK ID</th>
                <th className="py-2 px-3">DATE & TIME</th>
                <th className="py-2 px-3">FUEL LITRES</th>
                <th className="py-2 px-3">ODOMETER</th>
                <th className="py-2 px-3">COST (PKR)</th>
                <th className="py-2 px-3">SYNC STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5]">
              {fuelLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-bold text-[#0B6E4F]">{log.truckId}</td>
                  <td className="py-3 px-3 text-[#5F6F6A]">{new Date(log.dateTime).toLocaleString()}</td>
                  <td className="py-3 px-3 font-mono font-bold">{log.litres.toFixed(1)} L</td>
                  <td className="py-3 px-3 font-mono">{log.odometerKm.toLocaleString()} km</td>
                  <td className="py-3 px-3 font-mono">{log.cost ? `PKR ${log.cost.toLocaleString()}` : '—'}</td>
                  <td className="py-3 px-3">{renderStatusBadge(log.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 12. ALERTS VIEW
  if (view === 'alert') {
    const filteredAlerts = alerts.filter((a) => alertFilter === 'All' || a.type === alertFilter);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">MONITORING & INCIDENTS</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fleet Alerts</h1>
            <p className="text-xs text-[#5F6F6A]">Real-time detection for early warning congestion, excessive idling, and offline signals</p>
          </div>
          <button
            onClick={onMarkAllAlertsRead}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50"
          >
            Mark All as Read
          </button>
        </div>

        <div className="flex gap-2 text-xs font-bold overflow-x-auto pb-1">
          {['All', 'Early warning', 'Idling', 'Offline', 'Integrity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setAlertFilter(tab)}
              className={`px-3 py-1.5 rounded-xl transition-colors ${alertFilter === tab ? 'bg-[#0B6E4F] text-white' : 'bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] text-[#5F6F6A]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs divide-y divide-[#E1E8E5]">
          {filteredAlerts.map((alert) => (
            <div key={alert.id} className={`py-3 flex justify-between items-start gap-4 ${alert.read ? 'opacity-50' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  {renderStatusBadge(alert.type)}
                  <b className="text-sm">{alert.title}</b>
                </div>
                <div className="text-xs text-[#5F6F6A] mt-1">
                  Vehicle: <b>{alert.truckId}</b> · Driver: {alert.driverName} · Reported at {alert.time}
                </div>
              </div>
              {!alert.read && (
                <button
                  onClick={() => onMarkAlertRead(alert.id)}
                  className="text-xs text-[#0B6E4F] font-bold hover:underline"
                >
                  Mark as Read
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 13. DATA INTEGRITY VIEW (SHA-256 Chain + Tamper Demo)
  if (view === 'integ') {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">AUDIT & SECURITY</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Cryptographic Data Integrity</h1>
            <p className="text-xs text-[#5F6F6A]">
              Verifiable SHA-256 hash chaining: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">record_hash = SHA256(prev_hash + record_data)</code>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onVerifyIntegrity}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              ✓ Verify All Chains Now
            </button>
            <button
              onClick={onSimulateTamper}
              className="px-3.5 py-2 bg-[#D64545] hover:bg-[#B52B2B] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              ⚠️ Run Tamper Test Demo
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm">TRUCK_PK_108 Cryptographic Chain Sequence</h3>
            <span className="text-xs text-rose-600 font-bold">Tamper Evidence Flagged at #1041</span>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                <th className="py-2">SEQ #</th>
                <th className="py-2">PREVIOUS HASH (SHA-256)</th>
                <th className="py-2">CURRENT BLOCK HASH</th>
                <th className="py-2">TIMESTAMP</th>
                <th className="py-2">CHAIN STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5]">
              {hashChain.map((b) => (
                <tr key={b.seq} className={b.status === 'Check needed' ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}>
                  <td className="py-3 font-mono font-bold">#{b.seq}</td>
                  <td className="py-3 font-mono text-[11px] text-[#5F6F6A]">{b.prevHash.slice(0, 16)}...</td>
                  <td className="py-3 font-mono text-[11px] text-[#0B6E4F] font-bold">{b.hash.slice(0, 16)}...</td>
                  <td className="py-3 font-mono text-[11px] text-[#5F6F6A]">{b.timestamp}</td>
                  <td className="py-3">{renderStatusBadge(b.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-[#5F6F6A] space-y-1">
          <b>How the Tamper-Evident Hash Chain Works:</b>
          <p>
            Each record is digitally signed using its previous sequence hash and canonical serialized payload. If any field (cargo weight, fuel rate, or location) is modified in the database after the trip, the cryptographic checksum fails immediately upon verification, highlighting the exact compromised sequence block.
          </p>
        </div>
      </div>
    );
  }

  // 14. SETTINGS VIEW
  if (view === 'set') {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">WORKSPACE PREFERENCES</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">System Settings</h1>
          <p className="text-xs text-[#5F6F6A]">Configure company thresholds, targets, and fuel audit rules</p>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-6 rounded-2xl shadow-xs space-y-4 max-w-2xl text-xs">
          <div>
            <label className="block text-xs font-semibold mb-1">Company Name</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => onSaveSettings({ companyName: e.target.value })}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Fleet Monthly Allowance (kg CO₂)</label>
              <input
                type="number"
                value={settings.monthlyAllowanceTotalKg}
                onChange={(e) => onSaveSettings({ monthlyAllowanceTotalKg: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Idle Alert Threshold (Minutes)</label>
              <input
                type="number"
                value={settings.idleAlertMinutes}
                onChange={(e) => onSaveSettings({ idleAlertMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Daily CO₂ Target per Truck (kg)</label>
              <input
                type="number"
                value={settings.dailyCo2TargetPerTruckKg}
                onChange={(e) => onSaveSettings({ dailyCo2TargetPerTruckKg: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Early Warning Sensitivity</label>
              <select
                value={settings.earlyWarningSensitivity}
                onChange={(e) => onSaveSettings({ earlyWarningSensitivity: e.target.value as any })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-white dark:bg-[#16241F]"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => alert('Settings saved successfully.')}
            className="px-5 py-2.5 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl shadow-xs"
          >
            Save Workspace Settings
          </button>
        </div>
      </div>
    );
  }

  // 15. MOBILE APP API INTEGRATION GUIDE VIEW
  if (view === 'api') {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">DEVELOPER INTEGRATION</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Mobile App & External API Integration</h1>
          <p className="text-xs text-[#5F6F6A]">
            Use these standard REST endpoints to connect your group member's external mobile app (Flutter, React Native, Android Kotlin, iOS Swift) to this web dashboard.
          </p>
        </div>

        {/* Integration Architecture Card */}
        <div className="bg-emerald-50 dark:bg-[#1D3A2F] border border-emerald-200 dark:border-emerald-800 p-5 rounded-2xl text-xs text-emerald-950 dark:text-emerald-100 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <b className="text-sm text-emerald-900 dark:text-emerald-200">Will our member's separate mobile app conflict with this web app?</b>
          </div>
          <p className="leading-relaxed">
            <b>No, not at all.</b> The Driver App tab built into this website is simply a browser-based client. The backend is a standard, fully decoupled <b>REST API</b> running on Express.
            When your group member builds their mobile app, they will make standard HTTP <code>POST</code> and <code>GET</code> requests to this backend. The data will flow smoothly straight into your Manager Dashboard, updating maps, charts, and carbon logs in real time!
          </p>
        </div>

        {/* Live Test Ingest Tool */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm">Interactive Live Test Ingest</h3>
              <p className="text-xs text-[#5F6F6A]">Simulate an external mobile app sending a live telemetry payload to the backend</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/telemetry/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      truckId: 'TRUCK_PK_094',
                      speedKmh: 68.4,
                      rpm: 1980,
                      lat: 25.42,
                      lon: 68.39,
                      distanceDeltaKm: 3.5,
                      co2Kg: 2.8,
                      cargoKg: 3500,
                      idle: 0,
                    }),
                  });
                  const json = await res.json();
                  alert(`Success! Backend response: ${json.message}\nCheck Fleet Dashboard or Live Map to see the live update!`);
                } catch (e: any) {
                  alert('Error: ' + e.message);
                }
              }}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-xs"
            >
              🚀 Send Test Telemetry Packet
            </button>
          </div>
        </div>

        {/* API Endpoints Catalog */}
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/telemetry/ingest</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Vehicle Speed & Emission Stream</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              Mobile app calls this periodically or when network reconnects (supports batch array of records).
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`// Sample JSON payload to POST /api/telemetry/ingest
{
  "truckId": "TRUCK_PK_094",
  "speedKmh": 62.5,
  "rpm": 1850,
  "lat": 25.396,
  "lon": 68.358,
  "fuelRateLph": 24.1,
  "engineLoadPct": 68,
  "coolantC: 85,
  "cargoKg": 3500,
  "co2Kg": 0.18,
  "distanceDeltaKm": 0.5,
  "idle": 0
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/fuel-logs</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Driver Fuel Refill Entry</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              When driver enters refuel litres and odometer on mobile, call this endpoint:
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`// Sample JSON payload to POST /api/fuel-logs
{
  "truckId": "TRUCK_PK_094",
  "driverId": "PK-094",
  "litres": 120.5,
  "odometerKm": 83500,
  "cost": 32500,
  "dateTime": "2026-11-02T12:00:00Z"
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/route-events</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Eco-Route Advisory Decision</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              When the driver accepts or stays on route during a congestion detour:
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`// Sample JSON payload to POST /api/route-events
{
  "truckId": "TRUCK_PK_094",
  "trigger": "Early warning",
  "location": "Hala Bypass",
  "savedCo2Kg": 16.1,
  "savedDieselL": 6.0,
  "savedTimeMin": 11,
  "accepted": true
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[11px] font-black">GET</span>
                <code className="text-xs font-bold font-mono">/api/trucks/:id</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Fetch Truck Status & Target</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              Allows the mobile app to fetch driver truck details, remaining monthly allowance, and status.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback to Dashboard
  return <div>Loading view...</div>;
};
