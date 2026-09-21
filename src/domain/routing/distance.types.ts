import type { Coordinate } from './coordinate';

/**
 * Where a distance value came from.
 *
 * - `HAVERSINE`: straight-line great-circle estimate (no roads, no duration).
 * - `ROAD`:      real road-network routing (e.g. future OSRM provider).
 */
export type DistanceSource = 'HAVERSINE' | 'ROAD';

/**
 * A distance calculation result.
 *
 * Haversine results carry `source: 'HAVERSINE'` and leave
 * `durationMinutes` undefined — Haversine cannot produce road travel
 * duration and must never pretend to.
 *
 * `approximate` marks fallback estimates: `false` (or undefined, for
 * legacy callers) means a measured value; `true` means an estimate that
 * must be labelled as approximate by consumers.
 */
export interface DistanceResult {
  distanceKm: number;
  durationMinutes?: number;
  source: DistanceSource;
  approximate?: boolean;
  fallbackReason?: FallbackReason;
}

/** Why a result is an approximate fallback instead of a road measurement. */
export type FallbackReason = 'ROUTING_SERVICE_UNAVAILABLE' | 'NO_ROUTE';

/**
 * Provider abstraction for distance calculation.
 *
 * Route planning must depend on this interface, never on a concrete
 * provider — so `Haversine`, `OSRM` or any future implementation can be
 * swapped via `distanceCalculator.calculate(from, to)` without touching
 * the planner.
 *
 * Async by design: OSRM will later require HTTP calls, so even the
 * synchronous Haversine implementation returns a Promise.
 */
export interface DistanceCalculator {
  /** Declared source of every result this calculator produces. */
  readonly source: DistanceSource;
  calculate(from: Coordinate, to: Coordinate): Promise<DistanceResult>;
}

/** One labelled point in a distance-matrix request (order = input order). */
export interface MatrixPoint {
  id: string;
  coordinate: Coordinate;
}

/**
 * Pairwise distance matrix.
 *
 * - `pointIds[i]` labels row/column `i` (input order is preserved).
 * - `distancesKm[i][j]` is the distance from point `i` to point `j`.
 * - The abstraction supports asymmetric matrices (`[i][j] !== [j][i]`)
 *   because future road routing (one-way roads) can be asymmetric.
 */
export interface DistanceMatrix {
  pointIds: string[];
  distancesKm: number[][];
  source: DistanceSource;
}

/**
 * Time-aware travel matrix (road routing).
 *
 * Extends the `DistanceMatrix` idea with per-leg durations. Asymmetric by
 * design (`[i][j]` may differ from `[j][i]`) because road routing can
 * differ per direction. `approximate` mirrors `DistanceResult`: `false`
 * for measured OSRM values, `true` for Haversine/speed estimates.
 */
export interface TravelMatrix {
  pointIds: string[];
  distancesKm: number[][];
  durationsMinutes: number[][];
  source: DistanceSource;
  approximate: boolean;
  fallbackReason?: FallbackReason;
}

/**
 * GeoJSON LineString for route geometry.
 *
 * IMPORTANT: GeoJSON coordinates are `[longitude, latitude]` — the reverse
 * of the domain `Coordinate` (`{ latitude, longitude }`) and Leaflet's
 * `[lat, lng]`. Convert explicitly at every boundary and never assume.
 */
export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: Array<[number, number]>;
}

/** Minimal routing settings injected into infrastructure (never hardcoded). */
export interface RoutingSettings {
  riderSpeedKmh: number;
}
