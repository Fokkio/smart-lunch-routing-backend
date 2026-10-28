// ไฟล์นี้: กลยุทธ์สำรองของระบบเส้นทาง ลอง OSRM ก่อน ถ้าไม่ได้ให้ใช้ haversine แล้วติดป้ายว่าเป็นค่าประมาณ
import { validateCoordinate, type Coordinate } from '../../domain/routing/coordinate';
import type {
  DistanceCalculator,
  DistanceResult,
  MatrixPoint,
  RoutingSettings,
  TravelMatrix,
} from '../../domain/routing/distance.types';
import { HaversineDistanceCalculator } from '../../domain/routing/haversine-distance-calculator';
import type { OsrmRouteProvider, RouteGeometry } from './osrm-route.provider';
import type { OsrmTableProvider } from './osrm-matrix.provider';
import { RoutingError } from './routing.errors';

/**
 * Fallback strategy: OSRM first, Haversine estimate second.
 *
 * Architecture: primary = OSRM, failure = Haversine. Fallback results are
 * ALWAYS identifiable (`source: 'HAVERSINE'`, `approximate: true`,
 * `fallbackReason`) — a fallback is never disguised as road distance.
 *
 * Fallback duration uses the injected `riderSpeedKmh`
 * (`distance / speed * 60`, exact — no rounding here):
 * never a hardcoded constant, never a DB read inside pure code.
 */
// คำนวณเวลาเดินทางจากระยะทางและความเร็วแบบไม่ปัดเศษ: ระยะทาง / ความเร็ว * 60
export function estimateDurationMinutesExact(distanceKm: number, speedKmh: number): number {
  return (distanceKm / speedKmh) * 60;
}

// คลาสคำนวณระยะทางแบบมีสำรอง: ลองตัวหลักก่อน ถ้าเป็น RoutingError ให้ใช้ haversine แล้วติดป้าย approximate
export class FallbackDistanceCalculator implements DistanceCalculator {
  /**
   * Preferred (primary) source. The per-result `source` field is
   * authoritative for each call — inspect `result.source` and
   * `result.approximate`, not this property, to know what you got.
   */
  readonly source = 'ROAD' as const;

  constructor(
    private readonly primary: DistanceCalculator,
    private readonly settings: RoutingSettings,
    private readonly fallback = new HaversineDistanceCalculator(),
  ) {}

// คำนวณระยะทางคู่เดียว: สำเร็จคืนผลจากตัวหลัก ไม่สำเร็จคืนผล haversine พร้อมเหตุผลสำรอง
  async calculate(from: Coordinate, to: Coordinate): Promise<DistanceResult> {
    try {
      const result = await this.primary.calculate(from, to);
      return { ...result, approximate: result.approximate ?? false };
    } catch (error) {
      if (!(error instanceof RoutingError)) throw error;
      const haversine = await this.fallback.calculate(from, to);
      return {
        distanceKm: haversine.distanceKm,
        durationMinutes: estimateDurationMinutesExact(
          haversine.distanceKm,
          this.settings.riderSpeedKmh,
        ),
        source: 'HAVERSINE',
        approximate: true,
        fallbackReason:
          error.code === 'NO_ROUTE' ? 'NO_ROUTE' : 'ROUTING_SERVICE_UNAVAILABLE',
      };
    }
  }
}

/**
 * Travel matrix with fallback: one OSRM Table call, else a Haversine +
 * speed-estimated matrix (same shape, `approximate: true`).
 */
// ขอตารางระยะทาง: สำเร็จคืนตารางจาก OSRM ไม่สำเร็จสร้างตาราง haversine รูปเดียวกันแล้วติดป้าย approximate
export async function fetchTravelMatrixWithFallback(
  points: MatrixPoint[],
  dependencies: {
    tableProvider: OsrmTableProvider;
    settings: RoutingSettings;
    fallback?: DistanceCalculator;
  },
): Promise<TravelMatrix> {
  try {
    return await dependencies.tableProvider.fetchMatrix(points);
  } catch (error) {
    if (!(error instanceof RoutingError)) throw error;
    const fallback = dependencies.fallback ?? new HaversineDistanceCalculator();
    for (const point of points) validateCoordinate(point.coordinate);
    const n = points.length;
    const distancesKm: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const durationsMinutes: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    await Promise.all(
      points.flatMap((from, i) =>
        points.map(async (to, j) => {
          if (i === j) return;
          const result = await fallback.calculate(from.coordinate, to.coordinate);
          distancesKm[i]![j] = result.distanceKm;
          durationsMinutes[i]![j] =
            result.durationMinutes ??
            estimateDurationMinutesExact(result.distanceKm, dependencies.settings.riderSpeedKmh);
        }),
      ),
    );
    return {
      pointIds: points.map((p) => p.id),
      distancesKm,
      durationsMinutes,
      source: 'HAVERSINE',
      approximate: true,
      fallbackReason: 'ROUTING_SERVICE_UNAVAILABLE',
    };
  }
}

/**
 * Best-effort route geometry: returns the OSRM route on success, or a
 * null-geometry marker when OSRM is unavailable — so callers fall back to
 * matrix totals plus an approximate display line. Only `RoutingError` is
 * swallowed; programming bugs still throw.
 */
// ขอเส้นถนนแบบไม่ให้พัง: สำเร็จคืนเส้นทางจาก OSRM ไม่สำเร็จคืนเครื่องหมาย geometry ว่างเพื่อให้ผู้เรียกใช้เส้นประมาณแทน
export async function fetchRouteGeometrySafe(
  points: Coordinate[],
  routeProvider: OsrmRouteProvider,
): Promise<RouteGeometry> {
  try {
    return await routeProvider.fetchRoute(points);
  } catch (error) {
    if (!(error instanceof RoutingError)) throw error;
    return { distanceKm: 0, durationMinutes: 0, geometry: null, approximate: true };
  }
}
