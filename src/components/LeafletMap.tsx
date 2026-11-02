/**
 * EcoRoute Fleet - Leaflet Interactive Map Component
 * Visualizes fleet trucks, primary routes, and early warning eco-route detours
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Truck } from '../types';

// Route waypoints along the M-9 / N-5 corridor
export const CORRIDOR_POINTS: [number, number][] = [
  [24.86, 67.01], // Karachi
  [25.396, 68.358], // Hyderabad
  [25.814, 68.426], // Hala bypass early warning point
  [26.244, 68.41], // Nawabshah
  [27.705, 68.857], // Sukkur
];

export const ECO_DETOUR_POINTS: [number, number][] = [
  [25.396, 68.358], // Hyderabad exit
  [25.7, 68.2],
  [25.95, 68.3],
  [26.244, 68.41], // Nawabshah
];

export const HAZARD_POINT: [number, number] = [25.814, 68.426];

interface LeafletMapProps {
  trucks?: Truck[];
  selectedTruckId?: string;
  onSelectTruck?: (truckId: string) => void;
  height?: string | number;
  center?: [number, number];
  zoom?: number;
  miniMode?: boolean;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  trucks = [],
  selectedTruckId,
  onSelectTruck,
  height = '440px',
  center = [26.0, 68.2],
  zoom = 7,
  miniMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: !miniMode,
        attributionControl: !miniMode,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Primary corridor route
      L.polyline(CORRIDOR_POINTS, {
        color: '#2B7BD6',
        weight: miniMode ? 3 : 5,
        opacity: 0.85,
      }).addTo(map);

      // Eco-route detour
      L.polyline(ECO_DETOUR_POINTS, {
        color: '#1E9E5A',
        weight: miniMode ? 3 : 4,
        dashArray: '7, 7',
        opacity: 0.95,
      }).addTo(map);

      // Congestion Early Warning Hazard Pin
      const hazardIcon = L.divIcon({
        className: 'custom-hazard-pin',
        html: `<div style="background:#F5A524; color:#fff; width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font-weight:bold; font-size:14px; box-shadow:0 3px 8px rgba(0,0,0,0.3); border:2px solid #fff;">!</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(HAZARD_POINT, { icon: hazardIcon })
        .addTo(map)
        .bindPopup('<b>Early Warning Hazard</b><br>Congestion detected ahead near Hala bypass. Detour saves ~16 kg CO₂.');

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update truck markers when trucks change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    trucks.forEach((truck, index) => {
      // Calculate realistic position along corridor if not explicitly specified
      let lat = truck.lat || 25.0;
      let lon = truck.lon || 67.5;

      if (!truck.lat) {
        const factor = (index * 0.13 + 0.05) % 1;
        const segmentIdx = Math.min(Math.floor(factor * (CORRIDOR_POINTS.length - 1)), CORRIDOR_POINTS.length - 2);
        const u = factor * (CORRIDOR_POINTS.length - 1) - segmentIdx;
        const p1 = CORRIDOR_POINTS[segmentIdx];
        const p2 = CORRIDOR_POINTS[segmentIdx + 1];
        lat = p1[0] + (p2[0] - p1[0]) * u;
        lon = p1[1] + (p2[1] - p1[1]) * u;
      }

      const statusColor =
        truck.status === 'Active'
          ? '#1E9E5A'
          : truck.status === 'Idle'
          ? '#F5A524'
          : '#9AA7A2';

      const isSelected = truck.id === selectedTruckId;
      const truckShortId = truck.id.replace('TRUCK_PK_', '');

      const truckIcon = L.divIcon({
        className: 'custom-truck-pin',
        html: `
          <div style="
            background: ${statusColor};
            color: #ffffff;
            width: ${isSelected ? '36px' : '30px'};
            height: ${isSelected ? '36px' : '30px'};
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-size: ${isSelected ? '12px' : '11px'};
            font-weight: 800;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            border: ${isSelected ? '3px solid #ffffff' : '2px solid #ffffff'};
            transition: transform 0.2s ease;
          ">
            ${truckShortId}
          </div>
        `,
        iconSize: isSelected ? [36, 36] : [30, 30],
        iconAnchor: isSelected ? [18, 18] : [15, 15],
      });

      const marker = L.marker([lat, lon], { icon: truckIcon }).addTo(markersGroup);

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <div style="font-weight: 800; color: #1B2B27; margin-bottom: 2px;">${truck.id}</div>
          <div style="color: #5F6F6A; font-size: 11px; margin-bottom: 6px;">${truck.model} · ${truck.plate}</div>
          <div><b>Driver:</b> ${truck.driver}</div>
          <div><b>Status:</b> <span style="font-weight: 700; color: ${statusColor};">${truck.status}</span></div>
          <div><b>Distance:</b> ${truck.distanceKm.toLocaleString()} km</div>
          <div><b>Estimated CO₂ Today:</b> ${truck.co2TodayKg.toLocaleString()} kg</div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectTruck) {
          onSelectTruck(truck.id);
        }
      });
    });
  }, [trucks, selectedTruckId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: '12px',
        overflow: 'hidden',
        zIndex: 1,
      }}
    />
  );
};
