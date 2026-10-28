// ไฟล์นี้: คำนวณระยะทางคู่เดียวผ่าน OSRM Route service
import type { Coordinate } from '../../domain/routing/coordinate';
import type { DistanceCalculator, DistanceResult } from '../../domain/routing/distance.types';
import { OsrmClient } from './osrm.client';

/**
 * `DistanceCalculator` backed by the OSRM Route service (infrastructure).
 *
 * OSRM returns metres + seconds; converts to km (`/1000`) and minutes
 * (`/60`) without aggressive rounding — presentation formats later.
 * Any failure throws a coded `RoutingError` (never silent NaN); callers
 * that want a fallback should use the resilient wrapper in
 * `fallback-routing.ts`.
 */
// คลาสคำนวณระยะทางคู่เดียวผ่าน OSRM Route service
export class OsrmDistanceCalculator implements DistanceCalculator {
  readonly source = 'ROAD' as const;

// เก็บ client OSRM ไว้ใช้คำนวณระยะทาง
  constructor(private readonly client: OsrmClient) {}

// คำนวณระยะทางคู่เดียวผ่าน OSRM: เมตร -> กิโลเมตร วินาที -> นาที แหล่งที่มา ROAD ไม่ใช่ค่าประมาณ
  async calculate(from: Coordinate, to: Coordinate): Promise<DistanceResult> {
    const route = await this.client.getRoute([from, to]);
    return {
      distanceKm: route.distanceMetres / 1000,
      durationMinutes: route.durationSeconds / 60,
      source: this.source,
      approximate: false,
    };
  }
}
