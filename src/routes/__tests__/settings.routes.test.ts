import { describe, expect, it } from 'vitest';
import { validateSettings } from '../settings.routes';
import type { ShopSettings } from '../../models/shop-settings.model';

const current: ShopSettings = {
  settingId: 1, shopName: 'ร้าน', latitude: 16, longitude: 103,
  deliveryStartTime: '11:30:00', deliveryDeadline: '12:30:00', maxOrdersPerRider: 3,
  riderSpeedKmh: 30, boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2,
};
describe('shop settings validation', () => {
  it('accepts a valid partial update and rejects invalid windows and capacities', () => {
    expect(validateSettings({ shopName: 'ใหม่', latitude: 16.4 }, current)).toEqual({ shopName: 'ใหม่', latitude: 16.4 });
    expect(() => validateSettings({ deliveryStartTime: '13:00' }, current)).toThrow();
    expect(() => validateSettings({ maxOrdersPerRider: 4 }, current)).toThrow();
    expect(() => validateSettings({ boxFoodCost: -1 }, current)).toThrow();
  });
});
