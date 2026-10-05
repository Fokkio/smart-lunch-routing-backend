import { config } from '../config/env';
import { clusterOrders, minimumRiderCount, type ClusterOrder } from '../domain/delivery/order-clusterer';
import {
  assembleRoutePlan,
  InfeasiblePlanError,
  type AssembleJob,
  type AssembleOrder,
} from '../domain/delivery/route-plan-assembler';
import { finishSeconds, isOnTime, timeToSeconds } from '../domain/delivery/deadline-rule';
import type { Coordinate } from '../domain/routing/coordinate';
import type { GeoJsonLineString, MatrixPoint } from '../domain/routing/distance.types';
import { sequenceStops, type SequencedRoute } from '../domain/routing/route-sequencer';
import type { RoutePlanResponse, RoutePlanSummaryResponse } from '../domain/routing/route-plan.types';
import { fetchTravelMatrixWithFallback, fetchRouteGeometrySafe } from '../infrastructure/routing/fallback-routing';
import { OsrmClient } from '../infrastructure/routing/osrm.client';
import { OsrmTableProvider } from '../infrastructure/routing/osrm-matrix.provider';
import { OsrmRouteProvider } from '../infrastructure/routing/osrm-route.provider';
import { CustomerModel } from '../models/customer.model';
import { OrderModel } from '../models/order.model';
import { RiderModel } from '../models/rider.model';
import { RoutePlanModel } from '../models/route-plan.model';
import { ShopSettingsModel } from '../models/shop-settings.model';
import { badInput } from './input-validation';
import type { JobAssignment } from '../models/route-plan.model';
import { findAlternativeRoutes, routeSignature } from '../domain/delivery/alternative-plan';

/**
 * RoutePlan application workflow (STEP 7 pipeline):
 *
 * 1–3. load pending orders + customer coordinates + shop settings
 * 4.   shop + customer points → 5. road TravelMatrix (OSRM, else fallback)
 * 6.   fallback flagged approximate when routing is unavailable
 * 7.   minimum rider count → 8. cluster → 9. per-cluster permutation
 * 10.  per-job route geometry (null when unavailable)
 * 11–12. distance/duration → 13. deadline gate (more riders on failure)
 * 14.   infeasible → throw (never persisted as valid)
 * 15.   revenue/food/delivery/profit → 16. assemble → 17. persist
 */
export class RoutePlanningService {
  /** Generate and persist a NEW plan (never overwrites previous plans). */
  static async generate(planDate: string, options: { seedOffset?: number; startTime?: string; deadline?: string;orderIds?:number[]; excluded?: string } = {}): Promise<RoutePlanResponse> {
    const started = Date.now();
    const settings = await ShopSettingsModel.get();
    let orders = await OrderModel.findAll({ date: planDate, status: 'PENDING' });
    if(options.orderIds!==undefined){
      if(!Array.isArray(options.orderIds)||!options.orderIds.length||options.orderIds.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(options.orderIds).size!==options.orderIds.length)badInput('Choose distinct positive order IDs');
      const selected=new Set(options.orderIds);orders=orders.filter(order=>selected.has(order.id));
      if(orders.length!==selected.size)badInput('Some chosen orders are no longer pending for this date');
    }
    if (orders.length === 0) {
      throw new InfeasiblePlanError(`No pending orders for ${planDate}`);
    }

    const customers = new Map((await CustomerModel.findByIds(orders.map(o => o.customerId))).map(customer => [customer.id, customer]));
    const shop: Coordinate = { latitude: Number(settings.latitude), longitude: Number(settings.longitude) };
    const detailed: AssembleOrder[] = orders.map((order) => {
      const customer = customers.get(order.customerId);
      if (!customer) throw new Error(`Customer ${order.customerId} for order ${order.id} not found`);
      return {
        orderId: order.id, customerId: customer.id, customerName: customer.name,
        phone: customer.phone ?? '', address: customer.address,
        latitude: Number(customer.lat), longitude: Number(customer.lng), boxCount: order.boxes,
      };
    });

    const maxOrders = settings.maxOrdersPerRider;
    const riders = await RiderModel.findAvailable(planDate);
    const minimumRiders = minimumRiderCount(detailed.length, maxOrders);
    if (riders.length < minimumRiders) {
      throw new InfeasiblePlanError(`Need at least ${minimumRiders} available riders for ${detailed.length} orders; found ${riders.length}`);
    }

    const startTime = options.startTime ?? settings.deliveryStartTime;
    const deadline = options.deadline ?? settings.deliveryDeadline;
    const validTime = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    if (typeof startTime !== 'string' || typeof deadline !== 'string' || !validTime.test(startTime) || !validTime.test(deadline)) badInput('Invalid round time');
    const startSeconds = timeToSeconds(startTime);
    const deadlineSeconds = timeToSeconds(deadline);
    if (startSeconds >= deadlineSeconds) badInput('Round start must be before its deadline');
    const points: MatrixPoint[] = [
      { id: 'SHOP', coordinate: shop },
      ...detailed.map((o) => ({ id: String(o.orderId), coordinate: { latitude: o.latitude, longitude: o.longitude } })),
    ];
    const osrm = new OsrmClient(config.osrm.baseUrl, config.osrm.timeoutMs);
    const matrix = await fetchTravelMatrixWithFallback(points, {
      tableProvider: new OsrmTableProvider(osrm),
      settings: { riderSpeedKmh: Number(settings.riderSpeedKmh) },
    });

    const clusterInput: ClusterOrder[] = detailed.map((o) => ({
      id: String(o.orderId), coordinate: { latitude: o.latitude, longitude: o.longitude },
    }));

    let attempt: SequencedRoute[] | null = null;
    if (options.excluded !== undefined) {
      attempt = findAlternativeRoutes({ orders: clusterInput, boxes: new Map(detailed.map(order => [String(order.orderId), order.boxCount])), shop, matrix,
        maxOrders, riderCount: riders.length, availableMinutes: (deadlineSeconds - startSeconds) / 60, serviceMinutes: settings.stopServiceMinutes ?? 0,
        costs: {boxSalePrice:settings.boxSalePrice,boxFoodCost:settings.boxFoodCost,riderBaseCost:settings.riderBaseCost,riderCostPerKm:settings.riderCostPerKm}, excluded: options.excluded });
    }
    for (let count = minimumRiders; !attempt && count <= Math.min(detailed.length, riders.length); count++) {
      const clusters = clusterOrders(clusterInput, shop, count, {
        maxOrdersPerRider: maxOrders, seedOffset: options.seedOffset ?? 0,
      });
      const routes = clusters.map((ids) => sequenceStops('SHOP', ids, matrix));
      if (routes.every((route) => isOnTime(finishSeconds(startSeconds, route.totalDurationMinutes + route.orderIds.length * (settings.stopServiceMinutes ?? 0)), deadlineSeconds))) {
        attempt = routes;
        break;
      }
    }
    if (!attempt) {
      throw new InfeasiblePlanError(`No feasible plan for ${planDate}: deadline missed with ${riders.length} available rider(s)`);
    }

    const routeProvider = new OsrmRouteProvider(osrm);
    const geometries = await Promise.all(
      attempt.map(async (route) => {
        const coords = [shop, ...route.orderIds.map((id) => orderCoord(detailed, id))];
        const result = await fetchRouteGeometrySafe(coords, routeProvider);
        return result;
      }),
    );

    const jobs: AssembleJob[] = attempt.map((route, i) => ({
      orderIds: route.orderIds.map(Number),
      riderId: riders[i]!.id,
      geometry: geometries[i]?.geometry ?? null,
      legGeometries: geometries[i]?.legGeometries?.length === route.orderIds.length
        ? geometries[i]!.legGeometries : undefined,
    }));

    const plan = assembleRoutePlan({
      planDate, shop,
      startTime, deadline, stopServiceMinutes: settings.stopServiceMinutes ?? 0,
      orders: detailed, jobs, matrix,
      settings: {
        boxSalePrice: Number(settings.boxSalePrice), boxFoodCost: Number(settings.boxFoodCost),
        riderBaseCost: Number(settings.riderBaseCost), riderCostPerKm: Number(settings.riderCostPerKm),
      },
    });

    plan.shop = settings;
    plan.partialBatch = options.orderIds!==undefined;
    plan.startTime = startTime.slice(0, 5);
    plan.deliveryDeadline = deadline.slice(0, 5);
    const routePlanId = await RoutePlanModel.create(plan, startTime);
    const saved = await RoutePlanModel.findFull(routePlanId);
    if (!saved) throw new Error(`RoutePlan ${routePlanId} vanished after persist`);
    console.info(
      `[route-plan] date=${planDate} plan=${routePlanId} orders=${detailed.length} ` +
      `riders=${saved.riderCount} source=${saved.routingSource} approximate=${saved.approximate} ` +
      `${Date.now() - started}ms`,
    );
    if (saved.approximate) {
      console.warn(`[route-plan] plan=${routePlanId} used fallback routing (${saved.fallbackReason ?? 'unknown reason'})`);
    }
    return saved;
  }

  /** Search distinct feasible groupings against the current draft before persisting. */
  static async generateAlternative(planDate: string, options: {startTime?:string;deadline?:string;orderIds?:number[];basePlanId?:number} = {}): Promise<RoutePlanResponse> {
    if (!Number.isSafeInteger(options.basePlanId) || options.basePlanId! < 1) badInput('basePlanId must identify the current draft');
    const base = await RoutePlanModel.findFull(options.basePlanId!);
    if (!base || base.planDate !== planDate || base.status !== 'GENERATED') throw Object.assign(new Error('The current draft is no longer available; refresh plans'), { statusCode: 409 });
    return this.generate(planDate, { ...options,
      startTime: options.startTime ?? base.startTime ?? base.shop?.deliveryStartTime,
      deadline: options.deadline ?? base.deliveryDeadline ?? base.shop?.deliveryDeadline,
      orderIds: options.orderIds ?? base.jobs.flatMap(job => job.stops.map(stop => stop.orderId)),
      excluded: routeSignature(base.jobs.map(job => job.stops.map(stop => String(stop.orderId)))) });
  }

  static list(planDate?: string): Promise<RoutePlanSummaryResponse[]> {
    return RoutePlanModel.list(planDate);
  }

  static findById(id: number): Promise<RoutePlanResponse | null> {
    return RoutePlanModel.findFull(id);
  }

  static select(id: number, assignments?: JobAssignment[]): Promise<RoutePlanResponse | null> {
    return RoutePlanModel.select(id, assignments);
  }

  static delete(id: number): Promise<boolean> {
    return RoutePlanModel.deleteById(id);
  }
}

function orderCoord(orders: AssembleOrder[], id: string): Coordinate {
  const order = orders.find((o) => String(o.orderId) === id)!;
  return { latitude: order.latitude, longitude: order.longitude };
}
