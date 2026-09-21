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
export class OsrmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
  ) {}

  /** OSRM Route service for one ordered waypoint list. */
  async getRoute(points: Coordinate[]): Promise<OsrmRouteData> {
    for (const point of points) validateCoordinate(point);
    const body = await this.get(
      `/route/v1/driving/${formatPoints(points)}?overview=full&geometries=geojson&steps=false`,
    );
    return parseRouteBody(body);
  }

  /** OSRM Table service for an N×N distance/duration matrix (one call). */
  async getTable(points: Coordinate[]): Promise<OsrmTableData> {
    for (const point of points) validateCoordinate(point);
    const body = await this.get(
      `/table/v1/driving/${formatPoints(points)}?annotations=distance,duration`,
    );
    return parseTableBody(body, points.length);
  }

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

function formatPoints(points: Coordinate[]): string {
  return points.map((p) => `${p.longitude},${p.latitude}`).join(';');
}

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
  if (typeof distance !== 'number' || !Number.isFinite(distance)) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route is missing numeric distance');
  }
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    throw new RoutingError('MALFORMED_RESPONSE', 'OSRM route is missing numeric duration');
  }
  return { distanceMetres: distance, durationSeconds: duration, geometry: parseGeometry(first['geometry']) };
}

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

function parseTableBody(body: unknown, n: number): OsrmTableData {
  const root = asObject(body, 'response');
  requireOkCode(root);
  return {
    distancesMetres: parseNullableMatrix(root['distances'], 'distances', n),
    durationsSeconds: parseNullableMatrix(root['durations'], 'durations', n),
  };
}

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

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RoutingError('MALFORMED_RESPONSE', `OSRM ${name} is not an object`);
  }
  return value as Record<string, unknown>;
}
