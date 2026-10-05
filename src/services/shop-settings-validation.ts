import type { ShopSettings } from '../models/shop-settings.model';
import { badInput } from './input-validation';
const keys = [
  'shopName', 'latitude', 'longitude', 'deliveryStartTime', 'deliveryDeadline',
  'maxOrdersPerRider', 'riderSpeedKmh', 'boxSalePrice', 'boxFoodCost',
  'riderBaseCost', 'riderCostPerKm', 'stopServiceMinutes',
] as const;

export function validateSettings(input: unknown, current: ShopSettings): Partial<ShopSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) badInput('Settings must be an object');
  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).some(key => !keys.includes(key as typeof keys[number]))) badInput('Unknown shop setting');
  const merged = { ...current, ...patch } as ShopSettings;
  if (merged.stopServiceMinutes !== undefined && (!Number.isInteger(merged.stopServiceMinutes) || merged.stopServiceMinutes < 0 || merged.stopServiceMinutes > 30)) badInput('Stop service minutes must be 0-30');
  if (typeof merged.shopName !== 'string' || !merged.shopName.trim() || merged.shopName.length > 150) badInput('Invalid shop name');
  if (typeof merged.latitude !== 'number' || !Number.isFinite(merged.latitude) || merged.latitude < -90 || merged.latitude > 90 ||
      typeof merged.longitude !== 'number' || !Number.isFinite(merged.longitude) || merged.longitude < -180 || merged.longitude > 180) badInput('Invalid shop coordinates');
  const time = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  if (typeof merged.deliveryStartTime !== 'string' || typeof merged.deliveryDeadline !== 'string' ||
      !time.test(merged.deliveryStartTime) || !time.test(merged.deliveryDeadline) ||
      merged.deliveryStartTime.slice(0, 5) >= merged.deliveryDeadline.slice(0, 5)) badInput('Invalid delivery time window');
  if (!Number.isInteger(merged.maxOrdersPerRider) || merged.maxOrdersPerRider < 1 || merged.maxOrdersPerRider > 3) badInput('Max orders per rider must be 1-3');
  if (typeof merged.riderSpeedKmh !== 'number' || !Number.isFinite(merged.riderSpeedKmh) || merged.riderSpeedKmh <= 0 || merged.riderSpeedKmh > 120) badInput('Invalid rider speed');
  for (const key of ['boxSalePrice', 'boxFoodCost', 'riderBaseCost', 'riderCostPerKm'] as const) {
    if (typeof merged[key] !== 'number' || !Number.isFinite(merged[key]) || merged[key] < 0 || merged[key] > 1_000_000) badInput(`Invalid ${key}`);
  }
  return patch;
}


