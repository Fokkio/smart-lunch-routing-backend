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
  static async generate(planDate: string, options: { seedOffset?: number } = {}): Promise<RoutePlanResponse> {
    const started = Date.now();
    const settings = await ShopSettingsModel.get();
    const orders = await OrderModel.findAll({ date: planDate, status: 'PENDING' });
    if (orders.length === 0) {
      throw new InfeasiblePlanError(`No pending orders for ${planDate}`);
    }

    const customers = await Promise.all(orders.map((o) => CustomerModel.findById(String(o.customerId))));
    const shop: Coordinate = { latitude: Number(settings.latitude), longitude: Number(settings.longitude) };
    const detailed: AssembleOrder[] = orders.map((order, i) => {
      const customer = customers[i];
      if (!customer) throw new Error(`Customer ${order.customerId} for order ${order.id} not found`);
      return {
        orderId: order.id, customerId: customer.id, customerName: customer.name,
        phone: customer.phone ?? '', address: customer.address,
        latitude: Number(customer.lat), longitude: Number(customer.lng), boxCount: order.boxes,
      };
    });

    const maxOrders = settings.maxOrdersPerRider;
    const riders = await RiderModel.findAvailable();
    const minimumRiders = minimumRiderCount(detailed.length, maxOrders);
    if (riders.length < minimumRiders) {
      throw new InfeasiblePlanError(`Need at least ${minimumRiders} available riders for ${detailed.length} orders; found ${riders.length}`);
    }

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
    const startSeconds = timeToSeconds(settings.deliveryStartTime);
    const deadlineSeconds = timeToSeconds(settings.deliveryDeadline);

    let attempt: SequencedRoute[] | null = null;
    for (let count = minimumRiders; count <= Math.min(detailed.length, riders.length); count++) {
      const clusters = clusterOrders(clusterInput, shop, count, {
        maxOrdersPerRider: maxOrders, seedOffset: options.seedOffset ?? 0,
      });
      const routes = clusters.map((ids) => sequenceStops('SHOP', ids, matrix));
      if (routes.every((route) => isOnTime(finishSeconds(startSeconds, route.totalDurationMinutes), deadlineSeconds))) {
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
      startTime: settings.deliveryStartTime, deadline: settings.deliveryDeadline,
      orders: detailed, jobs, matrix,
      settings: {
        boxSalePrice: Number(settings.boxSalePrice), boxFoodCost: Number(settings.boxFoodCost),
        riderBaseCost: Number(settings.riderBaseCost), riderCostPerKm: Number(settings.riderCostPerKm),
      },
    });

    const routePlanId = await RoutePlanModel.create(plan, settings.deliveryStartTime);
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

  /** Deterministic alternative: same pipeline, rotated cluster seeds → NEW plan. */
  static generateAlternative(planDate: string): Promise<RoutePlanResponse> {
    return this.generate(planDate, { seedOffset: 1 });
  }

  static list(planDate?: string): Promise<RoutePlanSummaryResponse[]> {
    return RoutePlanModel.list(planDate);
  }

  static findById(id: number): Promise<RoutePlanResponse | null> {
    return RoutePlanModel.findFull(id);
  }

  static select(id: number): Promise<RoutePlanResponse | null> {
    return RoutePlanModel.select(id);
  }

  static delete(id: number): Promise<boolean> {
    return RoutePlanModel.deleteById(id);
  }
}

function orderCoord(orders: AssembleOrder[], id: string): Coordinate {
  const order = orders.find((o) => String(o.orderId) === id)!;
  return { latitude: order.latitude, longitude: order.longitude };
}
