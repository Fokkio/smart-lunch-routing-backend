// ไฟล์นี้: คำนวณระยะทางเส้นตรงบนผิวโลกแบบ haversine ใช้เป็นตัวสำรองตอน OSRM ใช้ไม่ได้
import { validateCoordinate, type Coordinate } from './coordinate';
import type { DistanceCalculator, DistanceResult } from './distance.types';

/**
 * Haversine distance calculator (pure Domain — no HTTP, no network).
 *
 * Returns the straight-line great-circle distance between two points.
 * It does NOT return road-driving distance, driving duration, or geometry.
 *
 * Use it for: deterministic unit testing, fallback calculation, sanity
 * checking, lightweight geographic comparison, possible future
 * pre-clustering. Do NOT label its output "actual route distance" —
 * real road routing (OSRM) will replace it where roads matter.
 */
// คลาสคำนวณระยะทางเส้นตรงแบบ haversine ไม่ใช้เครือข่าย
export class HaversineDistanceCalculator implements DistanceCalculator {
  readonly source = 'HAVERSINE' as const;

// คำนวณระยะทางเส้นตรงระหว่าง 2 พิกัด: คืนระยะทางกิโลเมตร แหล่งที่มา HAVERSINE และระบุว่าเป็นค่าประมาณ
  async calculate(from: Coordinate, to: Coordinate): Promise<DistanceResult> {
    validateCoordinate(from);
    validateCoordinate(to);
    return { distanceKm: haversineKmBetween(from, to), source: this.source };
  }
}

/**
 * Documented Earth mean radius (IUGG mean radius).
 * A named constant — not an unexplained magic number.
 */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;

// แปลงองศาเป็นเรเดียน (ใช้ในสูตร haversine)
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Core Haversine formula (synchronous, full internal precision —
 * no rounding here; formatting belongs to consumers).
 *
 *   dLat = lat2 - lat1;  dLon = lon2 - lon1
 *   a = sin²(dLat/2) + cos(lat1)·cos(lat2)·sin²(dLon/2)
 *   c = 2·atan2(√a, √(1−a))
 *   distance = R·c
 */
// คำนวณระยะทางเส้นตรงระหว่าง 2 พิกัดแบบ haversine -> กิโลเมตร (ฟังก์ชันตรง ๆ ไม่ผ่านคลาส)
export function haversineKmBetween(from: Coordinate, to: Coordinate): number {
  validateCoordinate(from);
  validateCoordinate(to);
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_MEAN_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
