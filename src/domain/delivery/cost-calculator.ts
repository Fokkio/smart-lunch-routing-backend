/**
 * Cost calculation (pure domain — money only, no routing or HTTP).
 *
 * Authoritative formulas (values loaded from `shop_settings` at runtime;
 * current defaults: 65 / 40 / 15 / 2):
 *
 *   totalRevenue      = totalBoxes × boxSalePrice
 *   totalFoodCost     = totalBoxes × boxFoodCost
 *   deliveryCost/job  = riderBaseCost + routeDistanceKm × riderCostPerKm × jobBoxes
 *   estimatedProfit   = totalRevenue − totalFoodCost − totalDeliveryCost
 *
 * Per the shop spec (Project.pdf): the rider charges a 15 THB base per trip
 * plus 2 THB per km for every box carried in that job.
 */
export interface CostSettings {
  boxSalePrice: number;
  boxFoodCost: number;
  riderBaseCost: number;
  /** THB per km per box carried. */
  riderCostPerKm: number;
}

export interface JobCostInput {
  distanceKm: number;
  boxes: number;
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
  jobs: JobCostInput[],
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
  const jobBoxesSum = jobs.reduce((sum, job) => sum + job.boxes, 0);
  if (jobBoxesSum !== totalBoxes) {
    throw new Error(`job boxes sum (${jobBoxesSum}) must equal totalBoxes (${totalBoxes})`);
  }
  const jobDeliveryCosts = jobs.map((job) => {
    if (!Number.isFinite(job.distanceKm) || job.distanceKm < 0) {
      throw new Error(`job distance must be a non-negative number, got ${job.distanceKm}`);
    }
    if (!Number.isInteger(job.boxes) || job.boxes < 0) {
      throw new Error(`job boxes must be a non-negative integer, got ${job.boxes}`);
    }
    return roundMoney(
      settings.riderBaseCost + job.distanceKm * settings.riderCostPerKm * job.boxes,
    );
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
