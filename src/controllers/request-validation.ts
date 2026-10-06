import { validDate } from '../services/input-validation';

export function parseNearbyQuery(
  latValue: unknown,
  lngValue: unknown,
  radiusValue: unknown,
  defaultRadiusKm: number,
): { lat: number; lng: number; radiusKm: number } {
  if (typeof latValue !== 'string' || !latValue.trim() || typeof lngValue !== 'string' || !lngValue.trim() ||
      (radiusValue !== undefined && (typeof radiusValue !== 'string' || !radiusValue.trim()))) badRequest('Coordinates and radius must be numeric query strings');
  const lat = Number(latValue);
  const lng = Number(lngValue);
  const radiusKm = radiusValue === undefined ? defaultRadiusKm : Number(radiusValue);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) badRequest('lat must be between -90 and 90');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) badRequest('lng must be between -180 and 180');
  if (!Number.isFinite(radiusKm) || radiusKm !== defaultRadiusKm) {
    badRequest(`radiusKm must be ${defaultRadiusKm} for this endpoint`);
  }
  return { lat, lng, radiusKm };
}

export function parseSimulationRequest(countValue: unknown, dateValue: unknown): { count: number; orderDate?: string } {
  const count = countValue === undefined ? 25 : Number(countValue);
  if (!Number.isInteger(count) || count < 20 || count > 30) {
    badRequest('count must be an integer between 20 and 30');
  }
  if (dateValue !== undefined && !validDate(dateValue)) {
    badRequest('orderDate must be YYYY-MM-DD');
  }
  return { count, orderDate: dateValue as string | undefined };
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}
