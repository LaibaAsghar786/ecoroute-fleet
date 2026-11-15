/**
 * EcoRoute Fleet - Emission, Fuel & Carbon Credit Calculation Engine
 * Standardised emission factors with cited UK DEFRA/DESNZ & IPCC sources.
 */

import { AllowanceBand, VehicleFuelType } from '../types';

export interface EmissionFactorSpec {
  factorKgCo2ePerUnit: number;
  unit: 'L' | 'kg' | 'kWh';
  source: string;
  notes: string;
}

export const EMISSION_FACTOR_SPECS: Record<VehicleFuelType, EmissionFactorSpec> = {
  Diesel: {
    factorKgCo2ePerUnit: 2.68,
    unit: 'L',
    source: 'UK DEFRA / DESNZ Greenhouse Gas Conversion Factors (Diesel, average biofuel blend)',
    notes: '2.68 kg CO₂e per litre burned (Tank-to-Wheel)',
  },
  CNG: {
    factorKgCo2ePerUnit: 2.75,
    unit: 'kg',
    source: 'UK DEFRA / DESNZ Conversion Factors (Compressed Natural Gas by mass)',
    notes: '2.75 kg CO₂e per kg of CNG fuel (measured in kg, not litres)',
  },
  Hybrid: {
    factorKgCo2ePerUnit: 2.68,
    unit: 'L',
    source: 'UK DEFRA / DESNZ Conversion Factors (Diesel-Electric Hybrid liquid fuel consumption)',
    notes: '2.68 kg CO₂e per litre of liquid fuel consumed',
  },
  EV: {
    factorKgCo2ePerUnit: 0.0,
    unit: 'kWh',
    source: 'Zero tailpipe emissions (Tank-to-Wheel); grid Well-to-Wheel excluded from tailpipe ledger',
    notes: '0.00 kg CO₂e per kWh at tailpipe',
  },
};

export const EMISSION_FACTORS: Record<VehicleFuelType, number> = {
  Diesel: EMISSION_FACTOR_SPECS.Diesel.factorKgCo2ePerUnit,
  CNG: EMISSION_FACTOR_SPECS.CNG.factorKgCo2ePerUnit,
  Hybrid: EMISSION_FACTOR_SPECS.Hybrid.factorKgCo2ePerUnit,
  EV: EMISSION_FACTOR_SPECS.EV.factorKgCo2ePerUnit,
};

export const CREDIT_CONTRACT = {
  kgPerCredit: 1000,
  unit: 'kg CO₂e',
  creditLabel: '1 Carbon Credit = 1,000 kg (1 metric tonne) CO₂e',
  allowanceUnit: 'kg CO₂e',
};

export function calculateCo2FromFuel(quantity: number, fuelType: VehicleFuelType = 'Diesel'): number {
  const factor = EMISSION_FACTORS[fuelType] ?? 2.68;
  return Number((quantity * factor).toFixed(2));
}

export function calculateFuelFromCo2(co2Kg: number, fuelType: VehicleFuelType = 'Diesel'): number {
  const ef = EMISSION_FACTORS[fuelType] ?? 2.68;
  if (ef === 0) return 0;
  return Number((co2Kg / ef).toFixed(2));
}

export function calculateCredits(co2Kg: number): number {
  return Number((co2Kg / CREDIT_CONTRACT.kgPerCredit).toFixed(2));
}

export function getRemainingDaysInMonth(referenceDate: Date = new Date()): {
  daysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  monthLabel: string;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedDays = referenceDate.getUTCDate();
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);
  const monthLabel = referenceDate.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { daysInMonth, elapsedDays, remainingDays, monthLabel };
}

export function getAllowanceBand(consumedKg: number, allowanceKg: number): {
  band: AllowanceBand;
  percentage: number;
  colorClass: string;
  badgeClass: string;
} {
  if (!allowanceKg || allowanceKg <= 0) {
    return { band: 'On track', percentage: 0, colorClass: '#1E9E5A', badgeClass: 'bg-emerald-100 text-emerald-800' };
  }
  const percentage = Number(((consumedKg / allowanceKg) * 100).toFixed(1));

  if (percentage >= 100) {
    return { band: 'Exceeded', percentage, colorClass: '#D64545', badgeClass: 'bg-rose-100 text-rose-800' };
  }
  if (percentage >= 95) {
    return { band: 'Critical', percentage, colorClass: '#D64545', badgeClass: 'bg-rose-100 text-rose-800' };
  }
  if (percentage >= 80) {
    return { band: 'Warning', percentage, colorClass: '#F5A524', badgeClass: 'bg-amber-100 text-amber-800' };
  }
  return { band: 'On track', percentage, colorClass: '#1E9E5A', badgeClass: 'bg-emerald-100 text-emerald-800' };
}
