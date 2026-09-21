import type { Coordinate } from '../../domain/routing/coordinate';
import type { GeoJsonLineString } from '../../domain/routing/distance.types';
import { OsrmClient } from './osrm.client';

/** Ordered road route with frontend-friendly GeoJSON geometry. */
export interface RouteGeometry {
  distanceKm: number;
  durationMinutes: number;
  /** GeoJSON LineString (`[longitude, latitude]`); null when unavailable. */
  geometry: GeoJsonLineString | null;
  approximate: boolean;
}

/**
 * Ordered-route geometry via the OSRM Route service (infrastructure).
 *
 * Requests `geometries=geojson&overview=full&steps=false` so the frontend
 * can render the polyline directly. Geometry coordinates stay in GeoJSON
 * `[longitude, latitude]` order — conversion to Leaflet `[lat, lng]`
 * happens in Angular, never here.
 */
export class OsrmRouteProvider {
  constructor(private readonly client: OsrmClient) {}

  async fetchRoute(points: Coordinate[]): Promise<RouteGeometry> {
    const route = await this.client.getRoute(points);
    return {
      distanceKm: route.distanceMetres / 1000,
      durationMinutes: route.durationSeconds / 60,
      geometry: route.geometry,
      approximate: false,
    };
  }
}
