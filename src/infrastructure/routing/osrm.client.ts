// ไฟล์นี้: client HTTP ตัวบาง ๆ สำหรับคุยกับ OSRM พร้อมตรวจ timeout และตรวจรูป response ให้เข้มงวด
import { validateCoordinate, type Coordinate } from '../../domain/routing/coordinate';
import type { GeoJsonLineString } from '../../domain/routing/distance.types';
import { RoutingError } from './routing.errors';

/** Injectable fetch shape (global `fetch` by default; stubbed in tests). */
export type FetchFn = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Parsed single-route payload from OSRM Route service. */
export interface OsrmRouteData {
  distanceMetres: number;
  durationSeconds: number;
  geometry: GeoJsonLineString;
  legGeometries?: GeoJsonLineString[];
  legs?: Array<{ distanceMetres: number; durationSeconds: number }>;
}

/** Parsed payload from OSRM Table service (null = no route for that pair). */
export interface OsrmTableData {
  distancesMetres: Array<Array<number | null>>;
  durationsSeconds: Array<Array<number | null>>;
}

/**
 * Thin OSRM HTTP client (infrastructure — no business rules here).
 *
 * - Coordinates are sent as `{longitude},{latitude}` per OSRM convention.
 * - AbortController enforces `timeoutMs`; aborts surface as TIMEOUT.
 * - Every response is strictly validated; anything unexpected throws a
 *   coded `RoutingError` instead of leaking `undefined` into math.
 */
// คลาส client HTTP สำหรับ OSRM: ส่งพิกัดแบบ longitude,latitude ตรวจ timeout และตรวจ response ให้เข้มงวด
export class OsrmClient {
// เก็บ URL หลักของ OSRM เวลา timeout และฟังก์ชัน fetch ที่ใช้ (ปกติใช้ fetch ของ Node)
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
  ) {}

  /** OSRM Route service for one ordered waypoint list. */
// ขอเส้นทางจาก OSRM Route service: ตรวจพิกัดก่อน ส่งจุดตามลำดับ แล้วตรวจว่าจำนวนขาตรงกับจุดที่ส่ง
  async getRoute(points: Coordinate[]): Promise<OsrmRouteData> {
    for (const point of points) validateCoordinate(point);
    const body = await this.get(
      `/route/v1/driving/${formatPoints(points)}?overview=full&geometries=geojson&steps=true`,
    );
    const route = parseRouteBody(body);
    if (route.legs && route.legs.length !== points.length - 1) {
      throw new RoutingError('MALFORMED_RESPONSE', 'OSRM leg count does not match waypoints');
    }
    return route;
  }

  /** OSRM Table service for an N×N distance/duration matrix (one call). */
// ขอตารางระยะทางจาก OSRM Table service: ตรวจพิกัดก่อน แล้วส่งจุดทั้งหมดในครั้งเดียว
  async getTable(points: Coordinate[]): Promise<OsrmTableData> {
    for (const point of points) validateCoordinate(point);
    const body = await this.get(
      `/table/v1/driving/${formatPoints(points)}?annotations=distance,duration`,
    );
    return parseTableBody(body, points.length);
  }

// ยิง HTTP ไป OSRM พร้อมจับเวลา timeout: HTTP ไม่สำเร็จหรือ timeout แปลงเป็น RoutingError
  private async get(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RoutingError(
          'HTTP_ERROR',
          `OSRM request failed with HTTP ${response.status} for ${path}`,
          response.status,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof RoutingError) throw error;
      if (error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted)) {
        throw new RoutingError('TIMEOUT', `OSRM request timed out after ${this.timeoutMs}ms for ${path}`);
      }
      throw new RoutingError(
        'HTTP_ERROR',
        `OSRM request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

// แปลงรายการพิกัดให้เป็นข้อความแบบ OSRM: longitude,latitude คั่นด้วยเครื่องหมาย ;
function formatPoints(points: Coordinate[]): string {
  return points.map((p) => `${p.longitude},${p.latitude}`).join(';');
}

// แกะ response ของ OSRM Route: ตรวจ code เป็น Ok ระยะทาง เวลา และ geometry ของแต่ละขาต้องเป็นตัวเลขและถูกต้อง
function parseRouteBody(body: unknown): OsrmRouteData {
  const root = asObject(body, 'response');
  requireOkCode(root);
  const routes = root['routes'];
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route response has empty routes array');
  }
  const first = asObject(routes[0], 'routes[0]');
  const distance = first['distance'];
  const duration = first['duration'];
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route is missing numeric distance');
  }
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route is missing numeric duration');
  }
  const legs = first['legs'];
  const legMetrics = Array.isArray(legs) ? legs.map(value => {
    const leg = asObject(value, 'leg');
    const distanceMetres = leg['distance'];
    const durationSeconds = leg['duration'];
    if (typeof distanceMetres !== 'number' || !Number.isFinite(distanceMetres) || distanceMetres < 0 ||
        typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      throw new RoutingError('MALFORMED_RESPONSE', 'OSRM leg metrics must be non-negative numbers');
    }
    return { distanceMetres, durationSeconds };
  }) : undefined;
  const legGeometries = Array.isArray(legs) ? legs.map((value) => {
    const steps = asObject(value, 'leg')['steps'];
    if (!Array.isArray(steps) || !steps.length) throw new RoutingError('MALFORMED_RESPONSE', 'OSRM leg has no steps');
    const coordinates = steps.flatMap((step, index) => {
      const points = parseGeometry(asObject(step, 'step')['geometry']).coordinates;
      return index ? points.slice(1) : points;
    });
    return { type: 'LineString' as const, coordinates };
  }) : undefined;
  return { distanceMetres: distance, durationSeconds: duration, geometry: parseGeometry(first['geometry']), legGeometries, legs: legMetrics };
}

// แกะ geometry ของ OSRM: ต้องเป็น GeoJSON LineString และทุกคู่พิกัดต้องเป็นตัวเลข [longitude, latitude]
function parseGeometry(value: unknown): GeoJsonLineString {
  const geometry = asObject(value, 'geometry');
  if (geometry['type'] !== 'LineString' || !Array.isArray(geometry['coordinates'])) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route geometry is not a GeoJSON LineString');
  }
  const coordinates = (geometry['coordinates'] as unknown[]).map((pair, index) => {
    if (
      !Array.isArray(pair) ||
      pair.length < 2 ||
      typeof pair[0] !== 'number' ||
      typeof pair[1] !== 'number' ||
      !Number.isFinite(pair[0]) ||
      !Number.isFinite(pair[1])
    ) {
      throw new RoutingError(
        'MALFORMED_RESPONSE',
        `OSRM route geometry coordinate ${index} is not a [longitude, latitude] pair`,
      );
    }
    return [pair[0], pair[1]] as [number, number];
  });
  return { type: 'LineString', coordinates };
}

// แกะ response ของ OSRM Table: ตรวจ code เป็น Ok แล้วแปลงตารางระยะทางและเวลาให้เป็นรูปเดียวกัน
function parseTableBody(body: unknown, n: number): OsrmTableData {
  const root = asObject(body, 'response');
  requireOkCode(root);
  return {
    distancesMetres: parseNullableMatrix(root['distances'], 'distances', n),
    durationsSeconds: parseNullableMatrix(root['durations'], 'durations', n),
  };
}

// แกะตารางตัวเลขของ OSRM: ต้องเป็นตาราง n x n ช่องว่างเป็น null ได้ นอกนั้นต้องเป็นตัวเลขไม่ติดลบ
function parseNullableMatrix(
  value: unknown,
  name: string,
  n: number,
): Array<Array<number | null>> {
  if (!Array.isArray(value) || value.length !== n) {
    throw new RoutingError('MALFORMED_RESPONSE', `OSRM table is missing ${n}x${n} ${name} matrix`);
  }
  return value.map((row, i) => {
    if (!Array.isArray(row) || row.length !== n) {
      throw new RoutingError('MALFORMED_RESPONSE', `OSRM table ${name} row ${i} has wrong length`);
    }
    return row.map((cell, j) => {
      if (cell === null || cell === undefined) return null;
      if (typeof cell !== 'number' || !Number.isFinite(cell) || cell < 0) {
        throw new RoutingError(
          'MALFORMED_RESPONSE',
          `OSRM table ${name}[${i}][${j}] is not a non-negative number`,
        );
      }
      return cell;
    });
  });
}

// ตรวจรหัส response ของ OSRM: NoRoute โยน NO_ROUTE รหัสอื่นที่ไม่ใช่ Ok โยน MALFORMED_RESPONSE
function requireOkCode(root: Record<string, unknown>): void {
  if (root['code'] === 'NoRoute') {
    throw new RoutingError('NO_ROUTE', 'OSRM returned NoRoute for these points');
  }
  if (root['code'] !== 'Ok') {
    throw new RoutingError(
      'MALFORMED_RESPONSE',
      `OSRM response code is ${JSON.stringify(root['code'])} (expected "Ok")`,
    );
  }
}

// ตรวจว่าค่าที่ส่งมาเป็น object จริงไหม ถ้าไม่ใช่โยน MALFORMED_RESPONSE
function asObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RoutingError('MALFORMED_RESPONSE', `OSRM ${name} is not an object`);
  }
  return value as Record<string, unknown>;
}
