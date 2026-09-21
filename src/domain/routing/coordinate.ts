import { InvalidCoordinateError } from './distance.errors';

/**
 * Reusable geographic coordinate (WGS84 degrees).
 *
 * Rules:
 * - latitude:  -90 <= latitude <= 90
 * - longitude: -180 <= longitude <= 180
 * - NaN, Infinity and -Infinity are rejected (never clamped or coerced).
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Validate a coordinate before any distance calculation.
 *
 * @throws {InvalidCoordinateError} when any value is NaN, non-finite,
 * or outside its valid range. Invalid values are never silently clamped
 * or converted, so bad input can never produce a meaningless `NaN km`.
 */
export function validateCoordinate(coordinate: Coordinate): void {
  const lat = (coordinate as Coordinate | null | undefined)?.latitude;
  const lng = (coordinate as Coordinate | null | undefined)?.longitude;

  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    throw new InvalidCoordinateError(`latitude must be a finite number, got ${String(lat)}`);
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng)) {
    throw new InvalidCoordinateError(`longitude must be a finite number, got ${String(lng)}`);
  }
  if (lat < -90 || lat > 90) {
    throw new InvalidCoordinateError(`latitude ${lat} out of range [-90, 90]`);
  }
  if (lng < -180 || lng > 180) {
    throw new InvalidCoordinateError(`longitude ${lng} out of range [-180, 180]`);
  }
}
