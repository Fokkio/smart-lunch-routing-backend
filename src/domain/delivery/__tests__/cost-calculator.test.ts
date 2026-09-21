import { describe, expect, it } from 'vitest';
import { calculateCosts } from '../cost-calculator';

// Current shop_settings defaults: 65 / 40 / 15 / 4.
const SETTINGS = { boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 4 };

describe('cost calculator', () => {
  it('computes the known-answer example: 100 boxes, 800 delivery, 1700 profit', () => {
    // Question: 100 boxes, one 196.25 km route. Revenue? Food? Delivery? Profit?
    // Answer: revenue 100×65=6500, food 100×40=4000,
    // delivery 15+4×196.25=800, profit 6500−4000−800=1700.
    const costs = calculateCosts(100, [196.25], SETTINGS);
    expect(costs.totalRevenue).toBe(6500);
    expect(costs.totalFoodCost).toBe(4000);
    expect(costs.totalDeliveryCost).toBe(800);
    expect(costs.estimatedProfit).toBe(1700);
    expect(costs.jobDeliveryCosts).toEqual([800]);
  });

  it('charges delivery per rider as 15 + 4 × route km (never per box)', () => {
    const costs = calculateCosts(6, [4.3], SETTINGS);
    expect(costs.jobDeliveryCosts).toEqual([32.2]);
    // Same distance with different box counts costs the same to deliver.
    expect(calculateCosts(1, [4.3], SETTINGS).totalDeliveryCost).toBe(
      calculateCosts(9, [4.3], SETTINGS).totalDeliveryCost,
    );
  });

  it('sums multiple jobs and derives profit', () => {
    const costs = calculateCosts(10, [10, 20], SETTINGS);
    expect(costs.jobDeliveryCosts).toEqual([55, 95]);
    expect(costs.totalDeliveryCost).toBe(150);
    expect(costs.totalRevenue).toBe(650);
    expect(costs.totalFoodCost).toBe(400);
    expect(costs.estimatedProfit).toBe(100);
  });

  it('rejects negative or non-numeric inputs', () => {
    expect(() => calculateCosts(-1, [1], SETTINGS)).toThrow();
    expect(() => calculateCosts(1, [-1], SETTINGS)).toThrow();
    expect(() => calculateCosts(1, [1], { ...SETTINGS, riderCostPerKm: -4 })).toThrow();
  });
});
