import type { Coordinate } from '../routing/coordinate';
import type { GeoJsonLineString, TravelMatrix } from '../routing/distance.types';
import { round2 } from '../routing/distance-calculator';
import {
  finishSeconds,
  isOnTime,
  secondsToHHMM,
  timeToSeconds,
} from './deadline-rule';
import { calculateCosts, type CostSettings } from './cost-calculator';
import type {
  DeliveryRouteResponse,
  RoutePlanResponse,
  RouteStopResponse,
} from '../routing/route-plan.types';

/** 422 — the request is well-formed but no feasible plan exists. */
export class InfeasiblePlanError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'InfeasiblePlanError';
  }
}

export interface AssembleOrder {
  orderId: number;
  customerId: number;
  customerName: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  boxCount: number;
}

export interface AssembleJob {
  /** Already-sequenced order ids (1–3). */
  orderIds: number[];
  riderId: number | null;
  geometry: GeoJsonLineString | null;
}

export interface AssembleInput {
  planDate: string;
  shop: Coordinate;
  startTime: string;
  deadline: string;
  orders: AssembleOrder[];
  jobs: AssembleJob[];
  /** Point ids must be `'SHOP'` plus `String(orderId)` for every order. */
  matrix: TravelMatrix;
  settings: CostSettings;
}

/**
 * Pure RoutePlan assembly (no IO): validates completeness, derives legs,
 * arrivals, deadline feasibility, and costs into one `RoutePlanResponse`.
 *
 * Throws `InfeasiblePlanError` when any order is missing/duplicated, a job
 * holds anything but 1–3 orders, or any job finishes after the deadline —
 * such a plan must never be persisted as valid.
 */
export function assembleRoutePlan(input: AssembleInput): RoutePlanResponse {
  validateCompleteness(input);
  const startSeconds = timeToSeconds(input.startTime);
  const deadlineSeconds = timeToSeconds(input.deadline);
  const indexOf = new Map(input.matrix.pointIds.map((id, i) => [id, i]));
  const shopIndex = mustHave(indexOf, 'SHOP');
  const byId = new Map(input.orders.map((o) => [o.orderId, o]));

  const jobs: DeliveryRouteResponse[] = input.jobs.map((job, riderIndex) => {
    const legs = legTotals(input.matrix, indexOf, shopIndex, job.orderIds);
    const finish = finishSeconds(startSeconds, legs.durationMinutes);
    if (!isOnTime(finish, deadlineSeconds)) {
      throw new InfeasiblePlanError(
        `Job ${riderIndex + 1} finishes ${secondsToHHMM(finish)} after deadline ${secondsToHHMM(deadlineSeconds)}`,
      );
    }
    const stops = buildStops(input, byId, indexOf, shopIndex, job, startSeconds);
    const boxes = job.orderIds.reduce((sum, id) => sum + byId.get(id)!.boxCount, 0);
    return {
      riderIndex,
      riderId: job.riderId,
      totalOrders: job.orderIds.length,
      totalBoxes: boxes,
      distanceKm: round2(legs.distanceKm),
      durationMinutes: round2(legs.durationMinutes),
      estimatedStartTime: secondsToHHMM(startSeconds),
      estimatedFinishTime: secondsToHHMM(finish),
      deliveryCost: 0, // filled below from shared cost calculation
      geometry: job.geometry,
      approximate: input.matrix.approximate,
      stops,
    };
  });

  const totalBoxes = input.orders.reduce((sum, o) => sum + o.boxCount, 0);
  const costs = calculateCosts(
    totalBoxes,
    jobs.map((j) => exactJobDistance(input.matrix, indexOf, shopIndex, input.jobs[j.riderIndex]!.orderIds)),
    input.settings,
  );
  jobs.forEach((job, i) => {
    job.deliveryCost = costs.jobDeliveryCosts[i]!;
  });

  const planFinish = jobs.reduce(
    (max, job) => Math.max(max, timeToSeconds(`${job.estimatedFinishTime}:00`)),
    startSeconds,
  );
  return {
    planDate: input.planDate,
    status: 'GENERATED',
    routingSource: input.matrix.source,
    approximate: input.matrix.approximate,
    ...(input.matrix.fallbackReason ? { fallbackReason: input.matrix.fallbackReason } : {}),
    riderCount: jobs.length,
    totalDistanceKm: round2(jobs.reduce((sum, j) => sum + exactJobDistance(input.matrix, indexOf, shopIndex, input.jobs[j.riderIndex]!.orderIds), 0)),
    estimatedFinishTime: secondsToHHMM(planFinish),
    totalBoxes: costs.totalBoxes,
    totalRevenue: costs.totalRevenue,
    totalFoodCost: costs.totalFoodCost,
    totalDeliveryCost: costs.totalDeliveryCost,
    estimatedProfit: costs.estimatedProfit,
    jobs,
  };
}

function validateCompleteness(input: AssembleInput): void {
  const seen = new Map<number, number>();
  for (const job of input.jobs) {
    if (job.orderIds.length < 1 || job.orderIds.length > 3) {
      throw new InfeasiblePlanError(`Every job must hold 1–3 orders, got ${job.orderIds.length}`);
    }
    for (const id of job.orderIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const order of input.orders) {
    const count = seen.get(order.orderId) ?? 0;
    if (count === 0) throw new InfeasiblePlanError(`Order ${order.orderId} is missing from the plan`);
    if (count > 1) throw new InfeasiblePlanError(`Order ${order.orderId} is assigned ${count} times`);
  }
  if (seen.size !== input.orders.length) {
    throw new InfeasiblePlanError('Plan references unknown orders');
  }
}

function legTotals(
  matrix: TravelMatrix,
  indexOf: Map<string, number>,
  shopIndex: number,
  orderIds: number[],
): { distanceKm: number; durationMinutes: number } {
  return {
    distanceKm: exactJobDistance(matrix, indexOf, shopIndex, orderIds),
    durationMinutes: exactJobDuration(matrix, indexOf, shopIndex, orderIds),
  };
}

function exactJobDistance(
  matrix: TravelMatrix,
  indexOf: Map<string, number>,
  shopIndex: number,
  orderIds: number[],
): number {
  let total = 0;
  let previous = shopIndex;
  for (const id of orderIds) {
    const current = mustHave(indexOf, String(id));
    total += matrix.distancesKm[previous]![current]!;
    previous = current;
  }
  return total;
}

function exactJobDuration(
  matrix: TravelMatrix,
  indexOf: Map<string, number>,
  shopIndex: number,
  orderIds: number[],
): number {
  let total = 0;
  let previous = shopIndex;
  for (const id of orderIds) {
    const current = mustHave(indexOf, String(id));
    total += matrix.durationsMinutes[previous]![current]!;
    previous = current;
  }
  return total;
}

function buildStops(
  input: AssembleInput,
  byId: Map<number, AssembleOrder>,
  indexOf: Map<string, number>,
  shopIndex: number,
  job: AssembleJob,
  startSeconds: number,
): RouteStopResponse[] {
  let previous = shopIndex;
  let elapsedMinutes = 0;
  return job.orderIds.map((id, i) => {
    const order = byId.get(id)!;
    const current = mustHave(indexOf, String(id));
    const legKm = input.matrix.distancesKm[previous]![current]!;
    const legMin = input.matrix.durationsMinutes[previous]![current]!;
    elapsedMinutes += legMin;
    previous = current;
    return {
      sequence: i + 1,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      latitude: order.latitude,
      longitude: order.longitude,
      boxCount: order.boxCount,
      distanceFromPreviousKm: round2(legKm),
      // Display precision only: per-leg minutes round to whole minutes
      // (storage column is INT) and arrivals floor to HH:MM, so two close
      // stops can share an arrival label (e.g. 11:30 / 11:30). Internal
      // totals and deadline checks always use the exact fractional values.
      travelTimeFromPreviousMin: Math.round(legMin),
      estimatedArrivalTime: secondsToHHMM(finishSeconds(startSeconds, elapsedMinutes)),
    };
  });
}

function mustHave(indexOf: Map<string, number>, id: string): number {
  const index = indexOf.get(id);
  if (index === undefined) throw new InfeasiblePlanError(`TravelMatrix has no point "${id}"`);
  return index;
}
