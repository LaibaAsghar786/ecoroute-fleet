/**
 * EcoRoute Fleet - Interactive Modals with Validation
 */

import React, { useState } from 'react';
import { Truck, VehicleFuelType } from '../types';

interface ModalWrapperProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({ title, subtitle, onClose, children }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#16241F] text-[#1B2B27] dark:text-[#E6F0EC] border border-[#E1E8E5] dark:border-[#25382F] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in fade-in duration-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#1B2B27] dark:text-[#E6F0EC]">{title}</h2>
            {subtitle && <p className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-[#5F6F6A] hover:text-[#1B2B27] dark:hover:text-[#E6F0EC] p-1.5 rounded-lg hover:bg-[#EAF5F0] dark:hover:bg-[#1D3A2F] transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// 1. Add Truck Modal
interface AddTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (truckData: any) => Promise<void>;
}

export const AddTruckModal: React.FC<AddTruckModalProps> = ({ isOpen, onClose, onSave }) => {
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [fuelType, setFuelType] = useState<VehicleFuelType>('Diesel');
  const [driver, setDriver] = useState('');
  const [allowanceKg, setAllowanceKg] = useState('6000');
  const [odometerKm, setOdometerKm] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedPlate = plate.trim().toUpperCase();
    const trimmedModel = model.trim();
    const allowance = Number(allowanceKg);
    const odo = Number(odometerKm);

    if (!/^[A-Z0-9][A-Z0-9 -]{2,11}$/.test(trimmedPlate)) {
      setError('Enter a valid license plate (e.g. TK-9001).');
      return;
    }
    if (trimmedModel.length < 2 || trimmedModel.length > 40) {
      setError('Model must be between 2 and 40 characters.');
      return;
    }
    if (!(allowance > 0 && allowance <= 100000)) {
      setError('Monthly allowance must be between 1 and 100,000 kg CO₂.');
      return;
    }
    if (odo < 0) {
      setError('Starting odometer cannot be negative.');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        plate: trimmedPlate,
        model: trimmedModel,
        fuelType,
        driver: driver.trim() || 'Unassigned',
        monthlyAllowanceKg: allowance,
        startingOdometer: odo,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save truck.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Add Fleet Vehicle" subtitle="Register a new truck or van to the company fleet" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">License Plate</label>
          <input
            type="text"
            placeholder="e.g. TK-9001"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F] focus:outline-hidden focus:ring-2 focus:ring-[#0B6E4F]"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Truck Model</label>
          <input
            type="text"
            placeholder="e.g. Hino 500 Heavy Duty"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F] focus:outline-hidden focus:ring-2 focus:ring-[#0B6E4F]"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Fuel Type</label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as VehicleFuelType)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            >
              <option value="Diesel">Diesel</option>
              <option value="CNG">CNG</option>
              <option value="Hybrid">Hybrid</option>
              <option value="EV">Electric (EV)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Starting Odometer (km)</label>
            <input
              type="number"
              min="0"
              value={odometerKm}
              onChange={(e) => setOdometerKm(e.target.value)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Assigned Driver (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Bilal Ahmed"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">
            Monthly CO₂ Allowance Target (kg CO₂)
          </label>
          <input
            type="number"
            min="100"
            max="100000"
            value={allowanceKg}
            onChange={(e) => setAllowanceKg(e.target.value)}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            required
          />
          <p className="text-[11px] text-[#5F6F6A] dark:text-[#9DB0A8] mt-1">
            Typical: Heavy Truck 6,000–8,000 kg (6–8 credits); Medium Truck 4,000–6,000 kg; Van 2,000–3,000 kg.
          </p>
        </div>

        {error && <div className="text-xs text-[#D64545] font-semibold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-semibold rounded-lg shadow-sm"
          >
            {loading ? 'Saving...' : 'Save Vehicle'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

// 2. Edit Monthly Allowance Modal
interface EditAllowanceModalProps {
  truck: Truck | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (truckId: string, allowanceKg: number) => Promise<void>;
}

export const EditAllowanceModal: React.FC<EditAllowanceModalProps> = ({ truck, isOpen, onClose, onSave }) => {
  const [val, setVal] = useState(truck ? String(truck.monthlyAllowanceKg) : '6000');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (truck) setVal(String(truck.monthlyAllowanceKg));
  }, [truck]);

  if (!isOpen || !truck) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const allowance = Number(val);
    if (!(allowance > 0 && allowance <= 100000)) {
      setError('Please enter a positive allowance between 1 and 100,000 kg CO₂.');
      return;
    }

    try {
      setLoading(true);
      await onSave(truck.id, allowance);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update allowance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title={`Edit CO₂ Allowance · ${truck.id}`} subtitle={`Set monthly target for ${truck.plate} (${truck.model})`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">
            Monthly CO₂ Target (kg CO₂e)
          </label>
          <input
            type="number"
            min="100"
            max="100000"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            required
          />
          <div className="text-xs text-[#5F6F6A] dark:text-[#9DB0A8] mt-1.5 flex justify-between">
            <span>Equivalent in Credits:</span>
            <b>{(Number(val) / 1000).toFixed(2)} Credits</b>
          </div>
        </div>

        {error && <div className="text-xs text-[#D64545] font-semibold bg-rose-50 p-2.5 rounded-lg">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-semibold rounded-lg"
          >
            {loading ? 'Saving...' : 'Update Allowance'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};

// 3. Add Fuel Log Modal
interface AddFuelLogModalProps {
  trucks: Truck[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (fuelData: any) => Promise<void>;
}

export const AddFuelLogModal: React.FC<AddFuelLogModalProps> = ({ trucks, isOpen, onClose, onSave }) => {
  const [truckId, setTruckId] = useState(trucks[0]?.id || 'TRUCK_PK_094');
  const [litres, setLitres] = useState('');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [dateTime, setDateTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const L = Number(litres);
    const odo = Number(odometer);
    const c = cost ? Number(cost) : undefined;

    if (!(L > 0 && L <= 2000)) {
      setError('Litres refuelled must be between 0.1 and 2,000 L.');
      return;
    }
    if (!(odo >= 0)) {
      setError('Odometer reading must be a positive number.');
      return;
    }

    try {
      setLoading(true);
      await onSave({
        truckId,
        litres: L,
        odometerKm: odo,
        cost: c,
        dateTime: new Date(dateTime).toISOString(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save fuel log.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Log Vehicle Refuelling" subtitle="Record diesel or fuel refill with odometer validation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div>
          <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Select Truck</label>
          <select
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
          >
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.model} ({t.plate})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Fuel Quantity (Litres)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              placeholder="e.g. 120.5"
              value={litres}
              onChange={(e) => setLitres(e.target.value)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Current Odometer (km)</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 83500"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Refuel Cost (PKR, Optional)</label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 32500"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5F6F6A] dark:text-[#9DB0A8] mb-1">Refuel Date & Time</label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full px-3 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg bg-[#FBFDFB] dark:bg-[#16241F]"
            />
          </div>
        </div>

        {error && <div className="text-xs text-[#D64545] font-semibold bg-rose-50 p-2.5 rounded-lg">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#E1E8E5] dark:border-[#25382F] rounded-lg hover:bg-slate-50 dark:hover:bg-[#1D3A2F]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#0B6E4F] hover:bg-[#08553D] text-white font-semibold rounded-lg"
          >
            {loading ? 'Logging...' : 'Save Fuel Record'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
};
