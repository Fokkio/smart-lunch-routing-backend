/**
 * Cost calculation (pure domain — money only, no routing or HTTP).
 *
 * Authoritative formulas (values loaded from `shop_settings` at runtime;
 * current defaults: 65 / 40 / 15 / 4):
 *
 *   totalRevenue      = totalBoxes × boxSalePrice
 *   totalFoodCost     = totalBoxes × boxFoodCost
 *   deliveryCost/job  = riderBaseCost + routeDistanceKm × riderCostPerKm
 *   estimatedProfit   = totalRevenue − totalFoodCost − totalDeliveryCost
 *
 * NOTE: delivery cost depends on distance ONLY — never on box count.
 * The old prototype formula (`15 + 2 × km × boxes`) is retired.
 */
export interface CostSettings {
  boxSalePrice: number;
  boxFoodCost: number;
  riderBaseCost: number;
  riderCostPerKm: number;
}

export interface PlanCosts {
  totalBoxes: number;
  totalRevenue: number;
  totalFoodCost: number;
  totalDeliveryCost: number;
  estimatedProfit: number;
  jobDeliveryCosts: number[];
}

export function calculateCosts(
  totalBoxes: number,
  jobDistancesKm: number[],
  settings: CostSettings,
): PlanCosts {
  for (const [name, value] of Object.entries(settings) as Array<[string, number]>) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Cost setting ${name} must be a non-negative number, got ${value}`);
    }
  }
  if (!Number.isInteger(totalBoxes) || totalBoxes < 0) {
    throw new Error(`totalBoxes must be a non-negative integer, got ${totalBoxes}`);
  }
  const jobDeliveryCosts = jobDistancesKm.map((distanceKm) => {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      throw new Error(`job distance must be a non-negative number, got ${distanceKm}`);
    }
    return roundMoney(settings.riderBaseCost + distanceKm * settings.riderCostPerKm);
  });
  const totalRevenue = roundMoney(totalBoxes * settings.boxSalePrice);
  const totalFoodCost = roundMoney(totalBoxes * settings.boxFoodCost);
  const totalDeliveryCost = roundMoney(jobDeliveryCosts.reduce((sum, cost) => sum + cost, 0));
  return {
    totalBoxes,
    totalRevenue,
    totalFoodCost,
    totalDeliveryCost,
    estimatedProfit: roundMoney(totalRevenue - totalFoodCost - totalDeliveryCost),
    jobDeliveryCosts,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
