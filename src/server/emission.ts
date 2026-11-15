/**
 * EcoRoute Fleet - Emission & Fuel Calculation Engine
 * Adheres strictly to Section 6.2 of the technical specification
 */

import { AllowanceBand, VehicleFuelType } from '../types';

export const EMISSION_FACTORS: Record<VehicleFuelType, number> = {
  Diesel: 2.68, // kg CO2 per litre of diesel
  CNG: 2.75, // kg CO2 per kg
  Hybrid: 2.68, // based on diesel/petrol burned
  EV: 0.0, // tailpipe CO2 is 0 kg (grid emissions not included)
};

export function calculateCo2FromFuel(litres: number, fuelType: VehicleFuelType = 'Diesel'): number {
  return Number((litres * (EMISSION_FACTORS[fuelType] || 2.68)).toFixed(2));
}

export function calculateFuelFromCo2(co2Kg: number, fuelType: VehicleFuelType = 'Diesel'): number {
  const ef = EMISSION_FACTORS[fuelType] || 2.68;
  if (ef === 0) return 0;
  return Number((co2Kg / ef).toFixed(2));
}

export function calculateCredits(co2Kg: number): number {
  // Project convention: 1 credit = 1 metric tonne of CO2 = 1,000 kg CO2
  return Number((co2Kg / 1000).toFixed(2));
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
