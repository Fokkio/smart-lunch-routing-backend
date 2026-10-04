import { describe, expect, it } from 'vitest';
import { calculateCosts } from '../cost-calculator';

// Current shop_settings defaults: 65 / 40 / 15 / 2 (per Project.pdf:
// rider charges 15 base per trip + 2 THB per km per box carried).
const SETTINGS = { boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2 };

describe('cost calculator', () => {
  it('computes the PDF example: 6 boxes over 2 km → delivery 39', () => {
    // Shop story: 6 boxes, 2 km round. Revenue? Food? Delivery? Profit?
    // Answer: revenue 6×65=390, food 6×40=240,
    // delivery 15+2×2×6=39, profit 390−240−39=111.
    const costs = calculateCosts(6, [{ distanceKm: 2, boxes: 6 }], SETTINGS);
    expect(costs.totalRevenue).toBe(390);
    expect(costs.totalFoodCost).toBe(240);
    expect(costs.totalDeliveryCost).toBe(39);
    expect(costs.estimatedProfit).toBe(111);
    expect(costs.jobDeliveryCosts).toEqual([39]);
  });

  it('charges delivery per box carried: 15 + 2 × km × boxes', () => {
    const costs = calculateCosts(6, [{ distanceKm: 4.3, boxes: 6 }], SETTINGS);
    expect(costs.jobDeliveryCosts).toEqual([66.6]);
    // Same distance with fewer boxes costs less to deliver.
    expect(calculateCosts(1, [{ distanceKm: 4.3, boxes: 1 }], SETTINGS).totalDeliveryCost).toBe(23.6);
  });

  it('sums multiple jobs and derives profit', () => {
    const costs = calculateCosts(
      10,
      [
        { distanceKm: 10, boxes: 6 },
        { distanceKm: 20, boxes: 4 },
      ],
      SETTINGS,
    );
    expect(costs.jobDeliveryCosts).toEqual([135, 175]);
    expect(costs.totalDeliveryCost).toBe(310);
    expect(costs.totalRevenue).toBe(650);
    expect(costs.totalFoodCost).toBe(400);
    expect(costs.estimatedProfit).toBe(-60);
  });

  it('rejects negative, non-integer, or inconsistent inputs', () => {
    expect(() => calculateCosts(-1, [{ distanceKm: 1, boxes: 1 }], SETTINGS)).toThrow();
    expect(() => calculateCosts(1, [{ distanceKm: -1, boxes: 1 }], SETTINGS)).toThrow();
    expect(() => calculateCosts(1, [{ distanceKm: 1, boxes: -1 }], SETTINGS)).toThrow();
    expect(() => calculateCosts(1, [{ distanceKm: 1, boxes: 1.5 }], SETTINGS)).toThrow();
    expect(() => calculateCosts(2, [{ distanceKm: 1, boxes: 1 }], SETTINGS)).toThrow();
    expect(() =>
      calculateCosts(1, [{ distanceKm: 1, boxes: 1 }], { ...SETTINGS, riderCostPerKm: -2 }),
    ).toThrow();
  });
});
