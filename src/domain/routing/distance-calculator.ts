import type { Coordinate } from './coordinate';
import { haversineKmBetween } from './haversine-distance-calculator';
import type { RoutePoint } from './route.types';

export { EARTH_MEAN_RADIUS_KM, HaversineDistanceCalculator } from './haversine-distance-calculator';
export type { Coordinate } from './coordinate';
export { InvalidCoordinateError } from './distance.errors';
export type {
  DistanceCalculator,
  DistanceMatrix,
  DistanceResult,
  DistanceSource,
  FallbackReason,
  GeoJsonLineString,
  MatrixPoint,
  RoutingSettings,
  TravelMatrix,
} from './distance.types';
export { DistanceMatrixBuilder } from './distance-matrix';

/**
 * Geographic distance helpers.
 *
 * The authoritative implementation now lives in
 * `haversine-distance-calculator.ts` (see `HaversineDistanceCalculator`
 * and `DistanceCalculator`). The functions below are kept so the existing
 * route planner (`route-planner.ts`, ported from the Angular prototype
 * `src/app/core/delivery.service.ts`) keeps working unchanged.
 */

/**
 * Straight-line great-circle distance in kilometres between two points.
 * Delegates to the domain Haversine implementation (R = 6371.0088 km).
 */
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const from: Coordinate = { latitude: a.lat, longitude: a.lng };
  const to: Coordinate = { latitude: b.lat, longitude: b.lng };
  return haversineKmBetween(from, to);
}

/** Round to 2 decimals for stable API output (matches frontend rounding). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
