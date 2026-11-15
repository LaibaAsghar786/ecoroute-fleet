/**
 * EcoRoute Fleet - CSV & PDF Export Utilities
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Truck, FuelLog, RouteEvent } from '../types';

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent =
    '\uFEFF' + // UTF-8 BOM for Excel compatibility
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportFleetPdf(trucks: Truck[]) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setTextColor(11, 110, 79); // #0B6E4F brand green
  doc.text('EcoRoute Fleet - Fleet & Carbon Emission Report', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(95, 111, 106);
  doc.text(`Generated: ${new Date().toLocaleString()} | Estimated figures based on telemetry`, 14, 22);

  const tableHeaders = ['Truck ID', 'Model', 'Plate', 'Driver', 'Status', 'Distance (km)', 'CO₂ (kg)', 'Diesel (L)', 'Integrity'];
  const tableData = trucks.map((t) => [
    t.id,
    t.model,
    t.plate,
    t.driver,
    t.status,
    t.distanceKm.toLocaleString(),
    t.co2TodayKg.toLocaleString(),
    Math.round(t.co2TodayKg / 2.68).toLocaleString(),
    t.integrity,
  ]);

  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    startY: 28,
    styles: { fontSize: 9, font: 'helvetica' },
    headStyles: { fillColor: [11, 110, 79], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [244, 247, 246] },
  });

  doc.save('ecoroute_fleet_report.pdf');
}

export function exportCarbonAuditPdf(trucks: Truck[], allowances: Record<string, number>) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setTextColor(11, 110, 79);
  doc.text('EcoRoute Fleet - Carbon Credit & Allowance Audit', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(95, 111, 106);
  doc.text(`Generated: ${new Date().toLocaleString()} | 1 Credit = 1,000 kg CO₂ (1 metric tonne)`, 14, 22);

  const tableHeaders = [
    'Truck ID',
    'Driver',
    'CO₂ Today (kg)',
    'Est. Credits',
    'Monthly Allowance (kg)',
    '% Consumed',
    'Remaining (kg)',
    'Integrity',
  ];

  const tableData = trucks.map((t) => {
    const allowance = allowances[t.id] || t.monthlyAllowanceKg || 6000;
    const pct = allowance > 0 ? ((t.co2TodayKg / allowance) * 100).toFixed(1) : '0';
    const remaining = Math.max(0, allowance - t.co2TodayKg);
    return [
      t.id,
      t.driver,
      t.co2TodayKg.toLocaleString(),
      (t.co2TodayKg / 1000).toFixed(2),
      allowance.toLocaleString(),
      `${pct}%`,
      remaining.toLocaleString(),
      t.integrity,
    ];
  });

  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    startY: 28,
    styles: { fontSize: 9, font: 'helvetica' },
    headStyles: { fillColor: [15, 127, 115], textColor: [255, 255, 255] },
  });

  doc.save('ecoroute_carbon_audit.pdf');
}

export function exportFuelLogsPdf(logs: FuelLog[]) {
  const doc = new jsPDF();

  doc.setFontSize(15);
  doc.setTextColor(11, 110, 79);
  doc.text('EcoRoute Fleet - Fuel Refill Logbook', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(95, 111, 106);
  doc.text(`Generated: ${new Date().toLocaleString()} | Diesel emission factor 2.68 kg/L`, 14, 22);

  const tableHeaders = ['Truck ID', 'Date & Time', 'Litres (L)', 'Odometer (km)', 'Cost (PKR)', 'Status'];
  const tableData = logs.map((log) => [
    log.truckId,
    new Date(log.dateTime).toLocaleString(),
    log.litres.toFixed(1),
    log.odometerKm.toLocaleString(),
    log.cost ? log.cost.toLocaleString() : '-',
    log.status === 'synced' ? 'Synced' : 'Pending',
  ]);

  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [245, 165, 36], textColor: [40, 30, 10] },
  });

  doc.save('fleet_fuel_logs.pdf');
}
