import { Router } from 'express';
import { ShopSettingsModel, type ShopSettings } from '../models/shop-settings.model';

export const settingsRoutes = Router();
const keys = [
  'shopName', 'latitude', 'longitude', 'deliveryStartTime', 'deliveryDeadline',
  'maxOrdersPerRider', 'riderSpeedKmh', 'boxSalePrice', 'boxFoodCost',
  'riderBaseCost', 'riderCostPerKm',
] as const;

export function validateSettings(input: unknown, current: ShopSettings): Partial<ShopSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Settings must be an object');
  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).some(key => !keys.includes(key as typeof keys[number]))) throw new Error('Unknown shop setting');
  const merged = { ...current, ...patch } as ShopSettings;
  if (typeof merged.shopName !== 'string' || !merged.shopName.trim() || merged.shopName.length > 150) throw new Error('Invalid shop name');
  if (typeof merged.latitude !== 'number' || !Number.isFinite(merged.latitude) || merged.latitude < -90 || merged.latitude > 90 ||
      typeof merged.longitude !== 'number' || !Number.isFinite(merged.longitude) || merged.longitude < -180 || merged.longitude > 180) throw new Error('Invalid shop coordinates');
  const time = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  if (typeof merged.deliveryStartTime !== 'string' || typeof merged.deliveryDeadline !== 'string' ||
      !time.test(merged.deliveryStartTime) || !time.test(merged.deliveryDeadline) ||
      merged.deliveryStartTime.slice(0, 5) >= merged.deliveryDeadline.slice(0, 5)) throw new Error('Invalid delivery time window');
  if (!Number.isInteger(merged.maxOrdersPerRider) || merged.maxOrdersPerRider < 1 || merged.maxOrdersPerRider > 3) throw new Error('Max orders per rider must be 1-3');
  if (typeof merged.riderSpeedKmh !== 'number' || !Number.isFinite(merged.riderSpeedKmh) || merged.riderSpeedKmh <= 0 || merged.riderSpeedKmh > 120) throw new Error('Invalid rider speed');
  for (const key of ['boxSalePrice', 'boxFoodCost', 'riderBaseCost', 'riderCostPerKm'] as const) {
    if (typeof merged[key] !== 'number' || !Number.isFinite(merged[key]) || merged[key] < 0 || merged[key] > 1_000_000) throw new Error(`Invalid ${key}`);
  }
  return patch;
}

settingsRoutes.get('/', async (_req, res, next) => {
  try { res.json(await ShopSettingsModel.get()); } catch (error) { next(error); }
});
settingsRoutes.put('/', async (req, res, next) => {
  try {
    const patch = validateSettings(req.body, await ShopSettingsModel.get());
    res.json(await ShopSettingsModel.update(patch));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Invalid') || error.message.startsWith('Unknown') || error.message.startsWith('Settings must'))) {
      res.status(400).json({ message: error.message }); return;
    }
    next(error);
  }
});
