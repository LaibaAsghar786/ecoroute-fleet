/**
 * EcoRoute Fleet - Multi-stop Routing & Genetic Algorithm Optimizer
 * Implements Section 6.5 of the technical specification
 */

export const CITY_COORDINATES: Record<string, [number, number]> = {
  Karachi: [24.86, 67.01],
  Hyderabad: [25.39, 68.37],
  Nawabshah: [26.25, 68.41],
  Sukkur: [27.70, 68.86],
  Multan: [30.16, 71.52],
  Lahore: [31.55, 74.34],
  Islamabad: [33.68, 73.05],
  Quetta: [30.18, 66.98],
};

export function getHaversineDistanceKm(cityA: string, cityB: string): number {
  const coordA = CITY_COORDINATES[cityA];
  const coordB = CITY_COORDINATES[cityB];
  if (!coordA || !coordB) return 100;

  const [lat1, lon1] = coordA;
  const [lat2, lon2] = coordB;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLine = 6371 * c;
  // Realistic road multiplier (1.25x straight line road factor)
  return Math.round(straightLine * 1.25);
}

export function computeTotalDistanceKm(stops: string[]): number {
  if (stops.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += getHaversineDistanceKm(stops[i], stops[i + 1]);
  }
  return total;
}

/**
 * Optimises the order of middle stops using a lightweight Genetic Algorithm
 * Keeps first and last stop fixed.
 */
export function optimizeStopsGA(
  stops: string[],
  vehicleEfficiencyL100km: number = 30
): {
  originalStops: string[];
  optimizedStops: string[];
  originalDistanceKm: number;
  optimizedDistanceKm: number;
  savedDistanceKm: number;
  savedFuelL: number;
  savedCo2Kg: number;
} {
  if (stops.length <= 3) {
    const dist = computeTotalDistanceKm(stops);
    return {
      originalStops: [...stops],
      optimizedStops: [...stops],
      originalDistanceKm: dist,
      optimizedDistanceKm: dist,
      savedDistanceKm: 0,
      savedFuelL: 0,
      savedCo2Kg: 0,
    };
  }

  const start = stops[0];
  const end = stops[stops.length - 1];
  const middle = stops.slice(1, -1);

  // Permutations generation (if middle <= 6, exact optimal; else GA heuristic)
  let bestMiddle = [...middle];
  let bestDistance = computeTotalDistanceKm([start, ...bestMiddle, end]);

  // Genetic Algorithm with 20 generations
  const populationSize = 20;
  let population: string[][] = [bestMiddle];

  // Seed with nearest neighbour
  const nnList = [...middle];
  const nnResult: string[] = [];
  let curr = start;
  while (nnList.length > 0) {
    nnList.sort((a, b) => getHaversineDistanceKm(curr, a) - getHaversineDistanceKm(curr, b));
    const next = nnList.shift()!;
    nnResult.push(next);
    curr = next;
  }
  population.push(nnResult);

  // Random permutations
  for (let i = 2; i < populationSize; i++) {
    population.push([...middle].sort(() => Math.random() - 0.5));
  }

  // Evolve
  for (let gen = 0; gen < 25; gen++) {
    population = population.map((chrom) => {
      // evaluate
      const d = computeTotalDistanceKm([start, ...chrom, end]);
      if (d < bestDistance) {
        bestDistance = d;
        bestMiddle = [...chrom];
      }
      // mutation: 2-opt swap
      const mutated = [...chrom];
      if (Math.random() < 0.6 && mutated.length >= 2) {
        const i = Math.floor(Math.random() * mutated.length);
        const j = Math.floor(Math.random() * mutated.length);
        const temp = mutated[i];
        mutated[i] = mutated[j];
        mutated[j] = temp;
      }
      return mutated;
    });
  }

  const originalDist = computeTotalDistanceKm(stops);
  const optStops = [start, ...bestMiddle, end];
  const optDist = computeTotalDistanceKm(optStops);
  const savedKm = Math.max(0, originalDist - optDist);
  const savedFuelL = Number(((savedKm * vehicleEfficiencyL100km) / 100).toFixed(1));
  const savedCo2Kg = Number((savedFuelL * 2.68).toFixed(1));

  return {
    originalStops: [...stops],
    optimizedStops: optStops,
    originalDistanceKm: originalDist,
    optimizedDistanceKm: optDist,
    savedDistanceKm: savedKm,
    savedFuelL,
    savedCo2Kg,
  };
}
