import type { Coordinate } from '../coordinate';

/**
 * Simulated exam cases with independently prepared known answers
 * (Earth mean radius R = 6371.0088 km).
 *
 * Each case is written as Question → Answer. Expected values are
 * HARD-CODED — never recomputed with the implementation under test
 * (that would make the tests circular).
 *
 * Tolerance rationale: Haversine math in double precision agrees with an
 * independent reference to ~1e-12 km, so 1e-6 km (1 mm) leaves huge
 * headroom for harmless float noise while still catching real formula
 * mistakes (wrong radius, degree/radian mixups, missing cos terms all
 * shift results by far more than 1 mm on the large cases; the radius
 * itself is additionally locked by a dedicated constant test).
 */
export interface KnownAnswerCase {
  description: string;
  from: Coordinate;
  to: Coordinate;
  expectedDistanceKm: number;
  toleranceKm: number;
}

const TOLERANCE_KM = 1e-6;

// Shop coordinate reused from the existing repository (verified in
// backend route-planner DEFAULT_SHOP, frontend SHOP in
// src/app/core/models.ts, and customers.component.ts default).
const SHOP: Coordinate = { latitude: 16.24631, longitude: 103.25286 };

export const KNOWN_ANSWER_CASES: KnownAnswerCase[] = [
  {
    // EXAM CASE 1 — SAME POINT
    // Question: A = B = (16.24631, 103.25286). Calculate Haversine distance.
    // Answer: 0 km.
    description: 'same point returns zero distance',
    from: { ...SHOP },
    to: { ...SHOP },
    expectedDistanceKm: 0,
    toleranceKm: 1e-12,
  },
  {
    // EXAM CASE 2 — NORTH/SOUTH 0.001 DEGREE
    // Question: A = (16.24631, 103.25286), B = (16.24731, 103.25286).
    // Answer: 0.1111950802 km (≈ 111.195 metres).
    description: 'north-south 0.001 degree of latitude',
    from: { ...SHOP },
    to: { latitude: 16.24731, longitude: 103.25286 },
    expectedDistanceKm: 0.1111950802,
    toleranceKm: TOLERANCE_KM,
  },
  {
    // EXAM CASE 3 — EAST/WEST 0.001 DEGREE
    // Question: A = (16.24631, 103.25286), B = (16.24631, 103.25386).
    // Answer: 0.1067548243 km (≈ 106.755 metres).
    description: 'east-west 0.001 degree of longitude',
    from: { ...SHOP },
    to: { latitude: 16.24631, longitude: 103.25386 },
    expectedDistanceKm: 0.1067548243,
    toleranceKm: TOLERANCE_KM,
  },
  {
    // EXAM CASE 4 — SAMPLE SHOP-AREA POINT
    // Question: A = (16.24631, 103.25286), B = (16.25000, 103.26000).
    // Answer: 0.8656425318 km (≈ 865.643 metres).
    // IMPORTANT: Haversine straight-line distance only — NOT road distance.
    description: 'sample shop-area point',
    from: { ...SHOP },
    to: { latitude: 16.25, longitude: 103.26 },
    expectedDistanceKm: 0.8656425318,
    toleranceKm: TOLERANCE_KM,
  },
  {
    // EXAM CASE 5 — EQUATOR 1 DEGREE LONGITUDE
    // Question: A = (0, 0), B = (0, 1).
    // Answer: 111.1950802335 km.
    description: 'one degree of longitude at the equator',
    from: { latitude: 0, longitude: 0 },
    to: { latitude: 0, longitude: 1 },
    expectedDistanceKm: 111.1950802335,
    toleranceKm: TOLERANCE_KM,
  },
  {
    // EXAM CASE 6 — 1 DEGREE LATITUDE
    // Question: A = (0, 0), B = (1, 0).
    // Answer: 111.1950802335 km.
    description: 'one degree of latitude',
    from: { latitude: 0, longitude: 0 },
    to: { latitude: 1, longitude: 0 },
    expectedDistanceKm: 111.1950802335,
    toleranceKm: TOLERANCE_KM,
  },
];
