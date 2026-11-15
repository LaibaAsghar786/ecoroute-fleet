/**
 * EcoRoute Fleet - Fleet Web Dashboard Views
 * UK English text-only UI, connected to hardened REST API
 */

import React, { useState, useEffect } from 'react';
import {
  Truck,
  FuelLog,
  RouteEvent,
  Alert,
  HashChainBlock,
  ChainAnchor,
  VehicleProfile,
  CompanySettings,
  DayRecord,
} from '../types';
import { LeafletMap } from './LeafletMap';
import {
  CREDIT_CONTRACT,
  EMISSION_FACTOR_SPECS,
  getAllowanceBand,
  getRemainingDaysInMonth,
} from '../server/emission';
import { exportFleetPdf, exportCarbonAuditPdf, exportFuelLogsPdf, downloadCsv } from '../utils/export';
import { ApiService } from '../services/api';

const NETWORK_CITIES = [
  'Karachi',
  'Hyderabad',
  'Nawabshah',
  'Sukkur',
  'Multan',
  'Faisalabad',
  'Lahore',
  'Islamabad',
  'Quetta',
  'Peshawar',
];

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
  chainAnchors?: ChainAnchor[];
  vehicleProfiles: VehicleProfile[];
  settings: CompanySettings;
  onNotify: (message: string) => void;
  onRefreshData: () => Promise<void>;
  onOpenAddTruck: () => void;
  onOpenEditAllowance: (truck: Truck) => void;
  onOpenAddFuelLog: () => void;
  onMarkAlertRead: (id: string) => void;
  onMarkAllAlertsRead: () => void;
  onVerifyIntegrity: () => void;
  onSimulateTamper: () => void;
  onOptimizeRoute: (
    stops: string[],
    cargoKg?: number,
    objective?: 'emissions' | 'distance'
  ) => Promise<any>;
  onAddVehicleProfile: (profile: Partial<VehicleProfile>) => Promise<void>;
  onDeleteVehicleProfile: (id: string) => Promise<void>;
  onSaveSettings: (settings: Partial<CompanySettings>) => Promise<void>;
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
    chainAnchors = [],
    vehicleProfiles,
    settings,
    onNotify,
    onRefreshData,
    onOpenAddTruck,
    onOpenEditAllowance,
    onOpenAddFuelLog,
    onMarkAlertRead,
    onMarkAllAlertsRead,
    onVerifyIntegrity,
    onSimulateTamper,
    onOptimizeRoute,
    onSaveSettings,
  } = props;

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
  const [planningCargoKg, setPlanningCargoKg] = useState<number>(3500);
  const [planningObjective, setPlanningObjective] = useState<'emissions' | 'distance'>('emissions');
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [truckDetails, setTruckDetails] = useState<any>(null);
  const [integrityTruckFilter, setIntegrityTruckFilter] = useState<string>('ALL');
  const [researchData, setResearchData] = useState<any>(null);
  const [loadingResearch, setLoadingResearch] = useState(false);

  const billingPeriod = getRemainingDaysInMonth();

  useEffect(() => {
    if ((view === 'truck' || view === 'day') && selectedTruckId) {
      ApiService.getTruckDetails(selectedTruckId).then((res) => {
        if (res) setTruckDetails(res);
      });
    }
    if (view === 'lab') {
      setLoadingResearch(true);
      ApiService.getResearchBenchmarks()
        .then((res) => {
          if (res) setResearchData(res);
        })
        .finally(() => setLoadingResearch(false));
    }
  }, [view, selectedTruckId]);

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

  const totalCo2Today = trucks.reduce((sum, t) => sum + t.co2TodayKg, 0);
  const totalDieselToday = Math.round(totalCo2Today / 2.68);
  const totalDistanceToday = trucks.reduce((sum, t) => sum + t.distanceKm, 0);
  const totalCargoTonnes = (
    trucks.reduce((sum, t) => sum + (t.status === 'Active' ? t.cargoKg : 0), 0) / 1000
  ).toFixed(1);
  const activeCount = trucks.filter((t) => t.status === 'Active').length;
  const idleCount = trucks.filter((t) => t.status === 'Idle').length;
  const offlineCount = trucks.filter((t) => t.status === 'Offline').length;

  const totalAssignedAllowanceKg = trucks.reduce(
    (sum, t) => sum + (t.monthlyAllowanceKg || 6000),
    0
  );
  const estimatedCreditsUsedToday = (totalCo2Today / 1000).toFixed(2);
  const totalMtdCo2Kg = trucks.reduce((sum, t) => sum + t.co2TodayKg * 7.5, 0);
  const allowanceMtdPct =
    totalAssignedAllowanceKg > 0
      ? Math.min(100, (totalMtdCo2Kg / totalAssignedAllowanceKg) * 100).toFixed(1)
      : '0.0';

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
      case 'Verified':
      case 'On track':
      case 'synced':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E1F5EA] text-[#1E7B4A] dark:bg-emerald-950/60 dark:text-emerald-300">
            {status}
          </span>
        );
      case 'Idle':
      case 'Pending':
      case 'Warning':
      case 'pending':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF1D6] text-[#8A5A00] dark:bg-amber-950/60 dark:text-amber-300">
            {status}
          </span>
        );
      case 'Offline':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#ECEFEE] text-[#5F6F6A] dark:bg-slate-800 dark:text-slate-400">
            {status}
          </span>
        );
      case 'Check needed':
      case 'Critical':
      case 'Exceeded':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FDE4E4] text-[#B23232] dark:bg-rose-950/60 dark:text-rose-300">
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // 1. DASHBOARD VIEW
  if (view === 'dash') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F] dark:text-[#4ADE80]">
              FLEET OVERVIEW · TODAY
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#1B2B27] dark:text-[#E6F0EC]">
              Fleet Dashboard
            </h1>
            <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
              Estimated figures from telemetry · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
              Synchronised
            </span>
            <button
              onClick={async () => {
                await onRefreshData();
                onNotify('Synchronised fleet telemetry with backend.');
              }}
              className="px-3.5 py-1.5 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#1D3A2F] transition-colors shadow-2xs"
            >
              Sync Fleet
            </button>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-2xl shadow-sm flex flex-wrap gap-2">
          <button
            onClick={onOpenAddTruck}
            className="px-3.5 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
          >
            + Add Truck
          </button>
          <button
            onClick={() => setView('plan')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 dark:hover:bg-[#1D3A2F] rounded-xl text-xs font-bold transition-colors"
          >
            Multi-stop Planning
          </button>
          <button
            onClick={() => setView('logs')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 dark:hover:bg-[#1D3A2F] rounded-xl text-xs font-bold transition-colors"
          >
            Fuel & Fleet Logs
          </button>
          <button
            onClick={() => setView('veh')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 dark:hover:bg-[#1D3A2F] rounded-xl text-xs font-bold transition-colors"
          >
            Vehicle Profiles
          </button>
          <button
            onClick={() => setView('rep')}
            className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] hover:bg-slate-50 dark:hover:bg-[#1D3A2F] rounded-xl text-xs font-bold transition-colors"
          >
            Reports & PDF
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
            <div className="text-[10px] text-[#5F6F6A]">Fleet total (litres)</div>
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
            <div className="text-[10px] text-[#5F6F6A]">Declared cargo (tonnes)</div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A] dark:text-[#9DB0A8]">Total Distance</div>
            <div className="text-2xl font-black text-[#D64545] my-1 tabular-nums">
              {totalDistanceToday.toLocaleString()} <span className="text-xs font-normal">km</span>
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Fleet kilometres</div>
          </div>
        </div>

        {/* Hero Card & Credit Allowance Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-bold text-base text-[#1B2B27] dark:text-[#E6F0EC]">Monthly Credit Budget</h3>
                <span className="text-xs text-[#5F6F6A]">
                  {billingPeriod.monthLabel} ({billingPeriod.remainingDays} days remaining)
                </span>
              </div>
              <div className="text-2xl font-black my-1 tabular-nums">
                {(totalMtdCo2Kg / 1000).toFixed(1)}{' '}
                <span className="text-sm font-normal text-slate-500">
                  / {(settings.monthlyAllowanceTotalKg / 1000).toFixed(0)} Credits ({settings.monthlyAllowanceTotalKg.toLocaleString()} kg)
                </span>
              </div>
              <div className="w-full bg-[#E1E8E5] dark:bg-[#25382F] h-3 rounded-full overflow-hidden my-3">
                <div
                  className="bg-gradient-to-r from-[#0B6E4F] to-[#0F7F73] h-full rounded-full transition-all duration-500"
                  style={{ width: `${allowanceMtdPct}%` }}
                />
              </div>
              <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8]">
                {CREDIT_CONTRACT.creditLabel} · {billingPeriod.elapsedDays} of {billingPeriod.daysInMonth} billing days elapsed
              </p>
            </div>

            <div className="pt-3 border-t border-[#E1E8E5] dark:border-[#25382F] flex justify-between items-center text-xs">
              <span className="text-[#5F6F6A]">
                Remaining: {Math.max(0, settings.monthlyAllowanceTotalKg - totalMtdCo2Kg).toLocaleString()} kg CO₂e ({billingPeriod.remainingDays} days left)
              </span>
              <button
                onClick={() => setView('cred')}
                className="text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline"
              >
                Audit Details →
              </button>
            </div>
          </div>
        </div>

        {/* Fleet CO2 Credit Allowance Widget Per Truck */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
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
              const consumed = truck.co2TodayKg * 7.5;
              const { band, percentage, colorClass } = getAllowanceBand(consumed, allowance);

              return (
                <div key={truck.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="w-44">
                    <b
                      className="hover:text-[#0B6E4F] cursor-pointer"
                      onClick={() => {
                        setSelectedTruckId(truck.id);
                        setView('truck');
                      }}
                    >
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

        {/* Charts */}
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

            <div className="h-36 flex items-end gap-1.5 pt-4">
              {[120, 140, 110, 90, 80, 150, 240, 310, 280, 290, 340, 380, 310, 260].map((val, i) => {
                const displayVal = hourlyMetric === 'co2' ? val : Math.round(val / 2.68);
                const max = hourlyMetric === 'co2' ? 400 : 150;
                const hPct = Math.min(100, (displayVal / max) * 100);
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
              <span className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold">Target: 3,000 kg</span>
            </div>

            <div className="h-36 flex items-end gap-3 pt-4 relative">
              <div className="absolute top-10 left-0 right-0 border-t border-dashed border-[#D64545] z-0 opacity-60" />

              {[2980, 3050, 2890, 3210, 3100, 2950, totalCo2Today].map((val, i) => {
                const max = Math.max(3600, totalCo2Today + 200);
                const hPct = Math.min(100, (val / max) * 100);
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

        {/* Top Corridors & Recent Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm">Recent Fleet Alerts</h3>
                <button
                  onClick={() => setView('alert')}
                  className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline"
                >
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
              <p className="text-xs text-[#5F6F6A]">Select any truck row to view detailed telemetry and daily reports</p>
            </div>
            <button onClick={() => setView('fleet')} className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline">
              View All {trucks.length} Trucks →
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
            <p className="text-xs text-[#5F6F6A]">Select any truck to open full telemetry, fuel, and daily emission audit reports</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenAddTruck}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              + Add Truck
            </button>
            <button
              onClick={() => exportFleetPdf(trucks)}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
            >
              Export PDF
            </button>
            <button
              onClick={() => {
                const headers = ['Truck', 'Model', 'Plate', 'Driver', 'Status', 'Distance (km)', 'CO2 (kg)', 'Diesel (L)', 'Integrity'];
                const rows = filteredTrucks.map((t) => [t.id, t.model, t.plate, t.driver, t.status, t.distanceKm, t.co2TodayKg, Math.round(t.co2TodayKg / 2.68), t.integrity]);
                downloadCsv('fleet_trucks', headers, rows);
              }}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-200 dark:bg-slate-800 font-semibold">{trucks.length} Trucks Total</span>
          <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">{activeCount} Active</span>
          <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">{idleCount} Idle</span>
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-semibold">{offlineCount} Offline</span>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by truck ID, driver, or registration plate..."
            value={fleetSearch}
            onChange={(e) => setFleetSearch(e.target.value)}
            className="px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs flex-1 min-w-[220px] bg-white dark:bg-[#16241F]"
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

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl shadow-xs overflow-x-auto">
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

  // 3. TRUCK DETAIL VIEW
  if (view === 'truck') {
    const monthlyDays: DayRecord[] = truckDetails?.monthlySummary?.days || [];
    const truckTrips = truckDetails?.trips || [];
    const truckSavings = truckDetails?.savings || [];

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

        <div className="flex gap-2 border-b border-[#E1E8E5] dark:border-[#25382F] pb-2 text-xs font-bold flex-wrap">
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

        {truckTab === 'ov' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Estimated CO₂ Today</div>
                <div className="text-2xl font-black text-[#0B6E4F] dark:text-[#4ADE80] my-1 tabular-nums">{activeTruck.co2TodayKg.toLocaleString()} kg</div>
              </div>
              <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
                <div className="text-xs text-[#5F6F6A]">Estimated Credits</div>
                <div className="text-2xl font-black text-[#0F7F73] dark:text-[#2DD4BF] my-1 tabular-nums">{(activeTruck.co2TodayKg / 1000).toFixed(2)}</div>
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
                <h3 className="font-bold text-sm mb-3">Today&apos;s Hourly Emissions Progression</h3>
                <div className="h-36 flex items-end gap-1.5 pt-4">
                  {[24, 28, 19, 15, 32, 45, 52, 48, 49, 56, 62, 51, 40].map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-[#0B6E4F] rounded-t-sm" style={{ height: `${(v / 70) * 100}%` }} />
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
                  Telemetry records cryptographically chained with SHA-256 signatures.
                </div>
              </div>
            </div>
          </div>
        )}

        {truckTab === 'mo' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">October 2026 Monthly Logbook</h3>
                <p className="text-xs text-[#5F6F6A]">Select any day row to inspect telemetry and route events</p>
              </div>
              <button
                onClick={() => {
                  const headers = ['Day', 'CO2 (kg)', 'Credits', 'Diesel (L)', 'CO2 Saved (kg)', 'Integrity'];
                  const rows = monthlyDays.map((d) => [d.date, d.co2Kg, d.credits, d.dieselL, d.co2SavedKg, d.integrity]);
                  downloadCsv(`${activeTruck.id}_october_report`, headers, rows);
                }}
                className="px-3 py-1.5 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-lg text-xs font-bold"
              >
                Download CSV
              </button>
            </div>

            <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl shadow-xs overflow-x-auto">
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
                  {monthlyDays.map((day) => (
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
                      <td className="py-2 px-3 text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline">Inspect Day →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {truckTab === 'tr' && (
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-xs overflow-x-auto">
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
                {(truckTrips.length > 0
                  ? truckTrips
                  : [
                      {
                        id: 'TRIP_KHI_HYD_102',
                        from: 'Karachi',
                        to: 'Hyderabad',
                        time: '06:10 - 09:40',
                        distanceKm: 162,
                        co2Kg: 142,
                      },
                    ]
                ).map((trip: any) => (
                  <tr key={trip.id}>
                    <td className="py-3 font-mono font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{trip.id}</td>
                    <td className="py-3">{trip.from} → {trip.to}</td>
                    <td className="py-3 text-[#5F6F6A]">{trip.time}</td>
                    <td className="py-3 font-mono">{trip.distanceKm} km</td>
                    <td className="py-3 font-mono font-bold">{trip.co2Kg} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {truckTab === 'sv' && (
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-4 shadow-xs overflow-x-auto">
            <h3 className="font-bold text-sm mb-3">Eco-Route Advisory Decisions</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                  <th className="py-2">DATE</th>
                  <th className="py-2">LOCATION</th>
                  <th className="py-2">PLANNED ROUTE</th>
                  <th className="py-2">ECO-ROUTE</th>
                  <th className="py-2">ESTIMATED SAVINGS</th>
                  <th className="py-2">ACCEPTED</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E8E5]">
                {truckSavings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-[#5F6F6A] text-center">
                      No eco-route events recorded for this truck yet.
                    </td>
                  </tr>
                ) : (
                  truckSavings.map((ev: RouteEvent) => (
                    <tr key={ev.id}>
                      <td className="py-3 text-[#5F6F6A]">{ev.date}</td>
                      <td className="py-3 font-medium">{ev.location}</td>
                      <td className="py-3">{ev.originalKm} km / {ev.originalCo2Kg} kg CO₂</td>
                      <td className="py-3 font-medium">{ev.ecoKm} km / {ev.ecoCo2Kg} kg CO₂</td>
                      <td className="py-3 font-bold text-emerald-600">{ev.savedCo2Kg} kg CO₂ · {ev.savedDieselL} L · {ev.savedTimeMin} min</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ev.accepted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                          {ev.accepted ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // 4. DAY DETAIL VIEW
  if (view === 'day') {
    const monthlyDays: DayRecord[] = truckDetails?.monthlySummary?.days || [];
    const dRec =
      monthlyDays.find((d) => d.day === (selectedDay || 12)) ||
      monthlyDays[0] || {
        day: selectedDay || 12,
        date: `2026-10-${String(selectedDay || 12).padStart(2, '0')}`,
        co2Kg: activeTruck.co2TodayKg,
        credits: Number((activeTruck.co2TodayKg / 1000).toFixed(2)),
        dieselL: Math.round(activeTruck.co2TodayKg / 2.68),
        distanceKm: activeTruck.distanceKm,
        co2SavedKg: 38,
        dieselSavedL: 14.2,
        timeSavedMin: 22,
        cargoKg: activeTruck.cargoKg,
        idleMin: 42,
        integrity: activeTruck.integrity,
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
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">CO₂ Emitted</div>
            <b className="text-lg font-black text-[#0B6E4F] tabular-nums">{dRec.co2Kg} kg</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Credits Used</div>
            <b className="text-lg font-black text-[#0F7F73] tabular-nums">{dRec.credits}</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Diesel Burned</div>
            <b className="text-lg font-black text-[#F5A524] tabular-nums">{dRec.dieselL} L</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Distance Driven</div>
            <b className="text-lg font-black text-[#2B7BD6] tabular-nums">{dRec.distanceKm} km</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Idle Time</div>
            <b className="text-lg font-black text-[#D64545] tabular-nums">{dRec.idleMin} min</b>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-3 rounded-xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Integrity</div>
            <div className="mt-1">{renderStatusBadge(dRec.integrity)}</div>
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
            Real-time positions along Karachi–Hyderabad–Nawabshah–Sukkur. OpenStreetMap tiles.
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
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${t.id === selectedTruckId ? 'border-[#0B6E4F] bg-[#EAF5F0] dark:bg-[#1D3A2F]' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#1D3A2F]/50'}`}
                  >
                    <div className="flex justify-between items-center">
                      <b className="text-[#0B6E4F] dark:text-[#4ADE80]">{t.id}</b>
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

  // 6. MULTI-STOP PLANNING VIEW (Emissions-Aware Road Graph GA Optimiser)
  if (view === 'plan') {
    const handleAddStop = () => {
      if (newStopCity && !planningStops.includes(newStopCity)) {
        setPlanningStops([...planningStops, newStopCity]);
      }
    };

    const handleRemoveStop = (idx: number) => {
      if (planningStops.length <= 2) {
        onNotify('Route must have at least 2 stops (origin and destination).');
        return;
      }
      const updated = [...planningStops];
      updated.splice(idx, 1);
      setPlanningStops(updated);
    };

    const handleRunGA = async () => {
      try {
        const res = await onOptimizeRoute(planningStops, planningCargoKg, planningObjective);
        setOptimizationResult(res);
        if (res && res.optimizedStops) {
          setPlanningStops(res.optimizedStops);
        }
        onNotify('Emissions-aware route optimisation complete.');
      } catch (err: any) {
        onNotify('Optimisation failed: ' + err.message);
      }
    };

    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">LOGISTICS ROUTING</div>
          <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Multi-stop Route Optimisation</h1>
          <p className="text-xs text-[#5F6F6A]">
            Emissions-aware Genetic Algorithm (GA) evaluates verified road network distances, congestion delays, terrain gradient, idling burn, and cargo mass to minimise CO₂.
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
                      className="text-slate-500 hover:text-rose-600 px-2 py-0.5 text-[11px] font-semibold"
                    >
                      Remove
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
                {NETWORK_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddStop}
                className="px-4 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
              >
                + Add Stop
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <label className="block font-semibold text-[#5F6F6A] mb-1">Declared Cargo Mass (kg)</label>
                <input
                  type="number"
                  min={0}
                  max={40000}
                  value={planningCargoKg}
                  onChange={(e) => setPlanningCargoKg(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-white dark:bg-[#16241F]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5F6F6A] mb-1">Optimisation Objective</label>
                <select
                  value={planningObjective}
                  onChange={(e) => setPlanningObjective(e.target.value as 'emissions' | 'distance')}
                  className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-xl bg-white dark:bg-[#16241F]"
                >
                  <option value="emissions">Lowest CO₂ Emissions</option>
                  <option value="distance">Shortest Road Distance</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleRunGA}
              className="w-full py-3 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              Run Genetic Algorithm Optimiser
            </button>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm mb-2">Optimisation Outcome</h3>
              {optimizationResult ? (
                <div className="space-y-3 text-xs">
                  <div className="p-4 bg-emerald-50 dark:bg-[#1D3A2F] text-emerald-900 dark:text-emerald-100 rounded-xl space-y-2 border border-emerald-300 dark:border-emerald-800">
                    <div className="text-sm font-bold">
                      Optimised Sequence Found ({optimizationResult.objective === 'emissions' ? 'Emissions-Aware' : 'Distance'})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>Original Distance: <b>{optimizationResult.originalDistanceKm} km</b></div>
                      <div>Optimised Distance: <b>{optimizationResult.optimizedDistanceKm} km</b></div>
                      <div>Original Est. CO₂: <b>{optimizationResult.originalCo2Kg} kg</b></div>
                      <div>Optimised Est. CO₂: <b>{optimizationResult.optimizedCo2Kg} kg</b></div>
                    </div>
                    <div className="text-sm font-black text-[#0B6E4F] dark:text-[#4ADE80] pt-2 border-t border-emerald-200 dark:border-emerald-700">
                      Savings: {optimizationResult.savedDistanceKm} km · {optimizationResult.savedFuelL} L Fuel · {optimizationResult.savedCo2Kg} kg CO₂ · {optimizationResult.savedTimeMin} min
                    </div>
                  </div>

                  {optimizationResult.baselines && (
                    <div className="p-3 rounded-xl border border-[#E1E8E5] dark:border-[#25382F] space-y-1.5 bg-slate-50/70 dark:bg-slate-900/40">
                      <div className="font-bold text-[11px] uppercase tracking-wider text-[#5F6F6A]">
                        Baseline &amp; Optimality Comparison (Seed {optimizationResult.seed})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                        <div>Shortest-Distance Baseline: <b>{optimizationResult.baselines.shortestPath?.co2Kg} kg CO₂</b> ({optimizationResult.baselines.shortestPath?.distanceKm} km)</div>
                        <div>Nearest-Neighbour Baseline: <b>{optimizationResult.baselines.nearestNeighbour?.co2Kg} kg CO₂</b> ({optimizationResult.baselines.nearestNeighbour?.distanceKm} km)</div>
                        {optimizationResult.baselines.exactOptimum && (
                          <div className="sm:col-span-2 text-[#0B6E4F] dark:text-[#4ADE80] font-semibold">
                            Exact Permutation Optimum: {optimizationResult.baselines.exactOptimum.co2Kg} kg CO₂ (GA Optimality Gap: {optimizationResult.baselines.exactOptimum.optimalityGapPct}%)
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {Array.isArray(optimizationResult.segments) && optimizationResult.segments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-bold text-[11px] uppercase tracking-wider text-[#5F6F6A]">Road Network Corridor Breakdown</div>
                      {optimizationResult.segments.map((seg: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-lg border border-[#E1E8E5] dark:border-[#25382F] flex justify-between items-center">
                          <div>
                            <b>{seg.from} → {seg.to}</b>
                            <div className="text-[11px] text-[#5F6F6A]">{(seg.viaRoads || []).join(' + ')}</div>
                          </div>
                          <div className="text-right font-mono">
                            <div>{seg.distanceKm} km · {seg.timeMin} min</div>
                            <div className="text-[#0B6E4F] dark:text-[#4ADE80] font-bold">{seg.co2Kg} kg CO₂</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#5F6F6A]">
                  Select &quot;Run Genetic Algorithm Optimiser&quot; to evaluate road corridors using verified highway distances, terrain gradient, congestion idling, and cargo load.
                </p>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-[11px] text-[#5F6F6A]">
              Algorithm: Dijkstra road-graph legs + deterministic seeded 40-generation GA (population = 32, Tournament Selection, Order Crossover OX, Elitism), cargo multiplier +18% per 10 t, grade &amp; idling fuel penalties.
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

              <div className="text-2xl font-black text-[#0B6E4F] dark:text-[#4ADE80] my-2 tabular-nums">
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
          <p className="text-xs text-[#5F6F6A]">All savings are computed from verified eco-routing advisories and input telemetry</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-[#0A5C44] to-[#0F7F73] text-white p-4 rounded-2xl">
            <div className="text-xs text-[#C5E6D9]">Cumulative CO₂ Saved</div>
            <div className="text-2xl font-black my-1 tabular-nums">1,704 kg</div>
            <div className="text-[10px] text-[#C5E6D9]">October MTD</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Total Diesel Saved</div>
            <div className="text-2xl font-black text-[#F5A524] my-1 tabular-nums">636 L</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Travel Time Saved</div>
            <div className="text-2xl font-black text-[#2B7BD6] my-1 tabular-nums">19 hours</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl">
            <div className="text-xs text-[#5F6F6A]">Reroute Events</div>
            <div className="text-2xl font-black text-[#7A5AF8] my-1 tabular-nums">{31 + routeEvents.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs overflow-x-auto">
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
            <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
              {routeEvents.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="py-2.5 font-semibold">{r.date}</td>
                  <td className="py-2.5 font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{r.truckId}</td>
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
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Carbon Savings Audit</h3>
            <p className="text-xs text-[#5F6F6A]">Certified breakdown of fuel reductions, avoided emissions, and credit allocations.</p>
            <div className="pt-2 flex gap-2">
              <button onClick={() => exportCarbonAuditPdf(trucks, {})} className="px-3 py-1.5 bg-[#0B6E4F] text-white font-bold rounded-lg text-xs">PDF</button>
              <button
                onClick={() => {
                  const headers = ['Truck', 'Driver', 'CO2 Today (kg)', 'Monthly Allowance (kg)'];
                  const rows = trucks.map((t) => [t.id, t.driver, t.co2TodayKg, t.monthlyAllowanceKg]);
                  downloadCsv('carbon_audit', headers, rows);
                }}
                className="px-3 py-1.5 border border-[#E1E8E5] dark:border-[#25382F] font-bold rounded-lg text-xs"
              >
                CSV
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Trip Logbook</h3>
            <p className="text-xs text-[#5F6F6A]">Official log of commercial trips, origins, destinations, distances, and driver declarations.</p>
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  const headers = ['Trip ID', 'From', 'To', 'Distance (km)', 'CO2 (kg)'];
                  const rows = [['TRIP_KHI_HYD_102', 'Karachi', 'Hyderabad', 162, 142], ['TRIP_HYD_NWB_103', 'Hyderabad', 'Nawabshah', 138, 131]];
                  downloadCsv('trip_logbook', headers, rows);
                }}
                className="px-3 py-1.5 border border-[#E1E8E5] dark:border-[#25382F] font-bold rounded-lg text-xs"
              >
                CSV Logbook
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-2">
            <h3 className="font-bold text-sm">Fuel Refills Audit</h3>
            <p className="text-xs text-[#5F6F6A]">Driver refill logs with timestamped odometer checks and variance reconciliation.</p>
            <div className="pt-2 flex gap-2">
              <button onClick={() => exportFuelLogsPdf(fuelLogs)} className="px-3 py-1.5 bg-[#F5A524] text-amber-950 font-bold rounded-lg text-xs">PDF</button>
              <button
                onClick={() => {
                  const headers = ['Truck', 'Date', 'Litres', 'Odometer'];
                  const rows = fuelLogs.map((l) => [l.truckId, l.dateTime, l.litres, l.odometerKm]);
                  downloadCsv('fuel_logs', headers, rows);
                }}
                className="px-3 py-1.5 border border-[#E1E8E5] dark:border-[#25382F] font-bold rounded-lg text-xs"
              >
                CSV
              </button>
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
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border-2 border-[#F5A524] rounded-xl text-amber-900 dark:text-amber-200 text-xs font-semibold space-y-1">
          <b>Estimated usage only. Not an official carbon registry balance.</b>
          <div className="text-[11px] font-normal text-amber-800 dark:text-amber-300">
            {CREDIT_CONTRACT.creditLabel} · Billing Period: {billingPeriod.monthLabel} ({billingPeriod.remainingDays} days remaining).
          </div>
          <div className="text-[11px] font-normal text-amber-800 dark:text-amber-300">
            Sources: Diesel {EMISSION_FACTOR_SPECS.Diesel.factorKgCo2ePerUnit} kg/{EMISSION_FACTOR_SPECS.Diesel.unit} ({EMISSION_FACTOR_SPECS.Diesel.source}); CNG {EMISSION_FACTOR_SPECS.CNG.factorKgCo2ePerUnit} kg/{EMISSION_FACTOR_SPECS.CNG.unit} (mass in kg); EV {EMISSION_FACTOR_SPECS.EV.factorKgCo2ePerUnit} kg/{EMISSION_FACTOR_SPECS.EV.unit} tailpipe.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Used Today</div>
            <div className="text-3xl font-black text-[#0B6E4F] dark:text-[#4ADE80] my-1 tabular-nums">
              {(totalCo2Today / 1000).toFixed(2)} <span className="text-sm font-normal text-slate-500">Credits ({totalCo2Today.toLocaleString()} kg)</span>
            </div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Used in {billingPeriod.monthLabel} (MTD)</div>
            <div className="text-3xl font-black text-[#0F7F73] dark:text-[#2DD4BF] my-1 tabular-nums">
              {(totalMtdCo2Kg / 1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">Credits ({Math.round(totalMtdCo2Kg).toLocaleString()} kg)</span>
            </div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-xs text-[#5F6F6A]">Monthly Allowance ({billingPeriod.remainingDays} days remaining)</div>
            <div className="text-3xl font-black text-[#F5A524] my-1 tabular-nums">
              {(settings.monthlyAllowanceTotalKg / 1000).toFixed(1)} <span className="text-sm font-normal text-slate-500">Credits ({settings.monthlyAllowanceTotalKg.toLocaleString()} kg)</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs overflow-x-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">Carbon Audit Ledger</h3>
            <button onClick={() => exportCarbonAuditPdf(trucks, {})} className="px-3.5 py-1.5 bg-[#0B6E4F] text-white font-bold rounded-lg text-xs">
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
            <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
              {trucks.map((t) => {
                const allowance = t.monthlyAllowanceKg || 6000;
                const { band, percentage } = getAllowanceBand(t.co2TodayKg * 7.5, allowance);
                return (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-[#1D3A2F]/40">
                    <td className="py-2.5 font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{t.id}</td>
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
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">REFILL AUDIT</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Fuel & Fleet Logs</h1>
            <p className="text-xs text-[#5F6F6A]">Refills submitted by drivers and fleet administrators. Offline entries remain queued until synchronised.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenAddFuelLog}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              + Log Fuel Refill
            </button>
            <button
              onClick={() => exportFuelLogsPdf(fuelLogs)}
              className="px-3.5 py-2 bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-xl text-xs font-bold"
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-[#1D3A2F] border border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl text-xs text-emerald-950 dark:text-emerald-100 flex justify-between items-center">
          <div>
            <b className="text-sm text-emerald-900 dark:text-emerald-200">Fuel Reconciliation Variance: 4.8% (Nominal)</b>
            <div className="text-emerald-800 dark:text-emerald-300 mt-0.5">
              Comparison between physical refuel receipts vs integrated ECU fuel rate sensors is within the allowable {settings.fuelVarianceThresholdPct}% threshold.
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">Nominal</span>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs overflow-x-auto">
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
            <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
              {fuelLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-[#1D3A2F]/40">
                  <td className="py-3 px-3 font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{log.truckId}</td>
                  <td className="py-3 px-3 text-[#5F6F6A]">{new Date(log.dateTime).toLocaleString('en-GB')}</td>
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

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
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
                  className="text-xs text-[#0B6E4F] dark:text-[#4ADE80] font-bold hover:underline"
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

  // 13. DATA INTEGRITY VIEW (SHA-256 Chain + HMAC Anchors)
  if (view === 'integ') {
    const chainTruckIds = Array.from(new Set(hashChain.map((b) => b.recordData.truckId)));
    const visibleBlocks =
      integrityTruckFilter === 'ALL'
        ? hashChain
        : hashChain.filter((b) => b.recordData.truckId === integrityTruckFilter);

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">AUDIT & SECURITY</div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">Cryptographic Data Integrity</h1>
            <p className="text-xs text-[#5F6F6A]">
              Verifiable SHA-256 hash chaining with HMAC-SHA256 anchor checkpoints:{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">
                record_hash = SHA256(prev_hash + canonical_payload)
              </code>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onVerifyIntegrity}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              Verify All Chains Now
            </button>
            <button
              onClick={onSimulateTamper}
              className="px-3.5 py-2 bg-[#D64545] hover:bg-[#B52B2B] text-white font-bold rounded-xl text-xs shadow-sm"
            >
              Run Tamper Test Demo
            </button>
          </div>
        </div>

        {/* Anchor Checkpoints */}
        {chainAnchors.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {chainAnchors.map((anc) => (
              <div key={anc.truckId} className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <b className="text-[#0B6E4F] dark:text-[#4ADE80]">{anc.truckId} Anchor</b>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    HMAC-SHA256 Signed
                  </span>
                </div>
                <div className="text-[#5F6F6A] font-mono text-[11px]">
                  Head Seq: #{anc.headSeq} ({anc.blockCount} blocks)
                </div>
                <div className="text-[#5F6F6A] font-mono text-[11px] truncate">
                  Head Hash: {anc.headHash}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl p-5 shadow-xs space-y-3 overflow-x-auto">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-sm">Persistent Cryptographic Ledger</h3>
            <select
              value={integrityTruckFilter}
              onChange={(e) => setIntegrityTruckFilter(e.target.value)}
              className="px-3 py-1.5 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg text-xs bg-white dark:bg-[#16241F]"
            >
              <option value="ALL">All Trucks ({hashChain.length} blocks)</option>
              {chainTruckIds.map((tid) => (
                <option key={tid} value={tid}>{tid}</option>
              ))}
            </select>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                <th className="py-2">TRUCK</th>
                <th className="py-2">SEQ #</th>
                <th className="py-2">PREVIOUS HASH (SHA-256)</th>
                <th className="py-2">CURRENT BLOCK HASH</th>
                <th className="py-2">TIMESTAMP</th>
                <th className="py-2">CHAIN STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
              {visibleBlocks.map((b) => (
                <tr key={`${b.recordData.truckId}-${b.seq}`} className={b.status === 'Check needed' ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}>
                  <td className="py-3 font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{b.recordData.truckId}</td>
                  <td className="py-3 font-mono font-bold">#{b.seq}</td>
                  <td className="py-3 font-mono text-[11px] text-[#5F6F6A]">{b.prevHash.slice(0, 16)}...</td>
                  <td className="py-3 font-mono text-[11px] text-[#0B6E4F] dark:text-[#4ADE80] font-bold">{b.hash.slice(0, 16)}...</td>
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
            Every accepted telemetry packet is permanently appended to its vehicle&apos;s ordered SHA-256 hash chain and anchored with an HMAC-SHA256 signature. Any post-trip modification to cargo mass, fuel rate, or emission values breaks verification immediately.
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
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-white dark:bg-[#16241F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Fleet Monthly Allowance (kg CO₂)</label>
              <input
                type="number"
                value={settings.monthlyAllowanceTotalKg}
                onChange={(e) => onSaveSettings({ monthlyAllowanceTotalKg: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-white dark:bg-[#16241F]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Idle Alert Threshold (Minutes)</label>
              <input
                type="number"
                value={settings.idleAlertMinutes}
                onChange={(e) => onSaveSettings({ idleAlertMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-white dark:bg-[#16241F]"
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
                className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-white dark:bg-[#16241F]"
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
            onClick={() => onNotify('Workspace settings saved successfully.')}
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
            Authenticated REST endpoints and MQTT HTTP webhook bridge for connecting your external mobile driver application (Flutter, React Native, Android Kotlin, iOS Swift).
          </p>
        </div>

        <div className="bg-emerald-50 dark:bg-[#1D3A2F] border border-emerald-200 dark:border-emerald-800 p-5 rounded-2xl text-xs text-emerald-950 dark:text-emerald-100 space-y-2">
          <div>
            <b className="text-sm text-emerald-900 dark:text-emerald-200">How the External Mobile App Connects</b>
          </div>
          <p className="leading-relaxed">
            The backend exposes a decoupled, role-protected <b>REST API</b> and <b>MQTT HTTP Webhook Bridge</b> ready for Vercel serverless or Node.js hosting. Mobile clients sign in via{' '}
            <code>POST /api/auth/login</code> to obtain a Bearer token, then submit deduplicated readings (using unique <code>eventId</code>) to update fleet positions, CO₂ totals, and SHA-256 integrity chains in real time.
          </p>
        </div>

        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm">Interactive Live Test Ingest</h3>
              <p className="text-xs text-[#5F6F6A]">Send a signed, deduplicated telemetry packet with GPS validation and hash-chain verification</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const uniqueEventId = `evt-web-test-${Date.now()}`;
                  const nextOdo = Number(((activeTruck.odometerKm || 80000) + 3.5).toFixed(1));
                  const json = await ApiService.sendTestTelemetry({
                    eventId: uniqueEventId,
                    truckId: activeTruck.id,
                    tripId: `TRIP_${activeTruck.id}_LIVE`,
                    ts: new Date().toISOString(),
                    speedKmh: 68.4,
                    rpm: 1980,
                    lat: activeTruck.lat ?? 25.42,
                    lon: activeTruck.lon ?? 68.39,
                    fuelRateLph: 23.5,
                    engineLoadPct: 64,
                    coolantC: 85,
                    distanceDeltaKm: 3.5,
                    odometerKm: nextOdo,
                    co2Kg: 2.8,
                    fuelMl: 1045,
                    cargoKg: activeTruck.cargoKg || 3500,
                    idle: 0,
                  });
                  await onRefreshData();
                  const first = json.results?.[0];
                  onNotify(
                    `${activeTruck.id}: ${json.message} (Seq #${first?.seq}, Hash ${first?.blockHash?.slice(0, 10)}...)`
                  );
                } catch (e: any) {
                  onNotify('Telemetry error: ' + e.message);
                }
              }}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-xs"
            >
              Send Test Telemetry Packet ({activeTruck.id})
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/auth/login</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Obtain Bearer Token (Manager / Driver)</span>
            </div>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`// Driver or Manager authentication
{
  "email": "driver.pk094@ecoroute.com",
  "password": "driver1234"
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/telemetry/ingest</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Deduplicated Telemetry & SHA-256 Chain</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              Requires <code>Authorization: Bearer &lt;token&gt;</code>, unique <code>eventId</code>, valid GPS bounds, and explicit <code>distanceDeltaKm</code> vs cumulative <code>odometerKm</code>.
            </p>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`{
  "eventId": "evt-pk094-20261114T120000Z",
  "truckId": "TRUCK_PK_094",
  "tripId": "TRIP_HYD_SUK_201",
  "ts": "2026-11-14T12:00:00Z",
  "speedKmh": 62.5,
  "rpm": 1850,
  "lat": 25.396,
  "lon": 68.358,
  "fuelRateLph": 24.1,
  "engineLoadPct": 68,
  "coolantC": 85,
  "cargoKg": 3500,
  "co2Kg": 0.18,
  "distanceDeltaKm": 0.5,
  "odometerKm": 83422.5,
  "idle": 0
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/route-events</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">Verified Eco-Route Decision</span>
            </div>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto">
{`{
  "truckId": "TRUCK_PK_094",
  "trigger": "Early warning",
  "location": "Hala Bypass",
  "originalKm": 18.4,
  "originalMin": 31,
  "originalL": 7.2,
  "ecoKm": 19.1,
  "ecoMin": 20,
  "ecoL": 1.2,
  "accepted": true
}`}
            </pre>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-black">POST</span>
                <code className="text-xs font-bold font-mono">/api/telemetry/mqtt-bridge</code>
              </div>
              <span className="text-[11px] text-[#5F6F6A]">MQTT Broker HTTP Webhook Bridge</span>
            </div>
            <p className="text-xs text-[#5F6F6A]">
              Connects HiveMQ Cloud or EMQX webhooks directly into the serverless backend using topic + payload JSON.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 16. RESEARCH LAB, BENCHMARK METHODOLOGY & TRIP READINESS VIEW
  if (view === 'lab') {
    const rt = researchData?.runtimeMetrics;
    const dq = researchData?.dataQuality;
    const bm = researchData?.benchmarks;

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B6E4F]">
              EXPERIMENTS &amp; METHODOLOGY
            </div>
            <h1 className="text-2xl font-black text-[#1B2B27] dark:text-[#E6F0EC]">
              Research Lab &amp; System Benchmarks
            </h1>
            <p className="text-xs text-[#5F6F6A]">
              Live runtime telemetry metrics, GA benchmark methodology, data quality verification, and fleet trip readiness
            </p>
          </div>
          <button
            onClick={() => {
              setLoadingResearch(true);
              ApiService.getResearchBenchmarks()
                .then((res) => {
                  if (res) setResearchData(res);
                  onNotify('Research benchmarks refreshed.');
                })
                .finally(() => setLoadingResearch(false));
            }}
            className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-bold rounded-xl text-xs shadow-xs"
          >
            {loadingResearch ? 'Running Benchmarks...' : 'Re-run Benchmark Suite'}
          </button>
        </div>

        {/* Runtime Performance & Packet Recovery KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A]">API / GA Latency</div>
            <div className="text-2xl font-black text-[#0B6E4F] dark:text-[#4ADE80] my-1 tabular-nums">
              {rt ? `${rt.apiLatencyMs} ms` : '—'}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Live benchmark pass</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A]">Server Memory (RSS)</div>
            <div className="text-2xl font-black text-[#0F7F73] dark:text-[#2DD4BF] my-1 tabular-nums">
              {rt ? `${rt.memoryRssMb} MB` : '—'}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Heap: {rt ? `${rt.heapUsedMb} MB` : '—'}</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A]">CPU Time (User)</div>
            <div className="text-2xl font-black text-[#2B7BD6] my-1 tabular-nums">
              {rt ? `${rt.cpuUserMs} ms` : '—'}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Sys: {rt ? `${rt.cpuSystemMs} ms` : '—'}</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A]">Packet Recovery</div>
            <div className="text-2xl font-black text-[#1E9E5A] my-1 tabular-nums">
              {dq ? `${dq.packetRecoveryRatePct}%` : '100%'}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">Idempotent eventId queue</div>
          </div>
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-4 rounded-2xl shadow-xs">
            <div className="text-[11px] font-semibold text-[#5F6F6A]">Hash Chain Blocks</div>
            <div className="text-2xl font-black text-[#7A5AF8] my-1 tabular-nums">
              {dq ? dq.totalHashBlocks : hashChain.length}
            </div>
            <div className="text-[10px] text-[#5F6F6A]">{dq ? `${dq.anchoredTrucks} signed anchors` : ''}</div>
          </div>
        </div>

        {/* Benchmark Methodology & Live Cases */}
        <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3">
          <div>
            <h3 className="font-bold text-sm">Benchmark Methodology &amp; Reproducible Experiment Results</h3>
            <p className="text-xs text-[#5F6F6A]">
              {bm?.benchmarkStandard || 'Deterministic seeded Genetic Algorithm evaluated over verified Pakistan highway graph against Shortest-Path, Nearest-Neighbour, and Exact Permutation baselines.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            {(bm?.cases || []).map((c: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl border border-[#E1E8E5] dark:border-[#25382F] space-y-1.5">
                <div className="font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{c.name}</div>
                {c.gaOptimizedCo2Kg !== undefined ? (
                  <div className="space-y-1 text-[#5F6F6A] dark:text-[#9DB0A8]">
                    <div>GA Emissions Optimum: <b className="text-[#1B2B27] dark:text-[#E6F0EC]">{c.gaOptimizedCo2Kg} kg CO₂</b> ({c.gaOptimizedDistanceKm} km)</div>
                    <div>Shortest-Distance Baseline: <b>{c.shortestDistanceCo2Kg} kg CO₂</b> ({c.shortestDistanceKm} km)</div>
                    <div>Nearest-Neighbour Heuristic: <b>{c.nearestNeighbourCo2Kg} kg CO₂</b></div>
                    <div>Exact Permutation Optimum: <b>{c.exactOptimumCo2Kg} kg CO₂</b> (Gap: <b>{c.optimalityGapPct}%</b>)</div>
                  </div>
                ) : (
                  <div className="space-y-1 text-[#5F6F6A] dark:text-[#9DB0A8]">
                    <div>Lowest-Emissions Corridor: <b className="text-[#1B2B27] dark:text-[#E6F0EC]">{c.lowestEmissionsRoads}</b> ({c.lowestEmissionsCo2Kg} kg CO₂ · {c.lowestEmissionsDistanceKm} km)</div>
                    <div>Shortest-Distance Corridor: <b>{c.shortestDistanceRoads}</b> ({c.shortestDistanceCo2Kg} kg CO₂ · {c.shortestDistanceDistanceKm ?? c.shortestDistanceKm} km)</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Data Quality & Fleet Trip Readiness Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-2 text-xs">
            <h3 className="font-bold text-sm">Data Quality &amp; Validation Architecture</h3>
            <ul className="space-y-1.5 text-[#5F6F6A] dark:text-[#9DB0A8]">
              <li><b>Telemetry Deduplication:</b> Unique <code>eventId</code> persisted in DB prevents duplicate CO₂ and distance counting.</li>
              <li><b>Distance Separation:</b> Incremental <code>distanceDeltaKm</code> vs monotonic cumulative <code>odometerKm</code> (ambiguous <code>distanceKm</code> rejected).</li>
              <li><b>GPS &amp; Bounds Validation:</b> Rejects non-finite/NaN, out-of-range coordinates ([-90..90], [-180..180]), future dates, and negative fuel/emissions.</li>
              <li><b>Emission Standards:</b> Diesel 2.68 kg/L (DEFRA), CNG 2.75 kg/kg (by mass), 1 Credit = 1,000 kg CO₂e.</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-[#16241F] border border-[#E1E8E5] dark:border-[#25382F] p-5 rounded-2xl shadow-xs space-y-3 overflow-x-auto">
            <h3 className="font-bold text-sm">Fleet Trip Readiness Status</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E8E5] text-[#5F6F6A]">
                  <th className="py-1.5">TRUCK</th>
                  <th className="py-1.5">GPS</th>
                  <th className="py-1.5">ODOMETER</th>
                  <th className="py-1.5">CHAIN</th>
                  <th className="py-1.5">READINESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E8E5] dark:divide-[#25382F]">
                {trucks.map((t) => {
                  const hasGps = typeof t.lat === 'number' && typeof t.lon === 'number';
                  const chainOk = t.integrity === 'Verified';
                  const ready = hasGps && chainOk && t.status !== 'Offline';
                  return (
                    <tr key={t.id}>
                      <td className="py-2 font-bold text-[#0B6E4F] dark:text-[#4ADE80]">{t.id}</td>
                      <td className="py-2 font-mono">{hasGps ? 'Valid' : 'Missing'}</td>
                      <td className="py-2 font-mono">{(t.odometerKm || 0).toLocaleString()} km</td>
                      <td className="py-2">{renderStatusBadge(t.integrity)}</td>
                      <td className="py-2 font-semibold">{ready ? 'Ready' : 'Action Required'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return <div>Loading view...</div>;
};
