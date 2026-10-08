import type { RowDataPacket } from 'mysql2/promise';
import type { GeoJsonLineString } from '../domain/routing/distance.types';
import type {
  DeliveryRouteResponse,
  RoutePlanStatus,
  RoutePlanSummaryResponse,
  RouteStopResponse,
} from '../domain/routing/route-plan.types';
import { toISODate } from './dates';
import { readSnapshot, type PlanSnapshot } from './plan-inputs';

export type PlanRow = RowDataPacket & {
  route_plan_id: number;
  plan_date: string | Date;
  start_time: string;
  estimated_finish_time: string | null;
  rider_count: number | null;
  total_distance_km: number | null;
  total_delivery_cost: number | null;
  total_revenue: number | null;
  total_food_cost: number | null;
  estimated_profit: number | null;
  status: RoutePlanStatus;
  routing_source: string | null;
  approximate: number | boolean | null;
  input_snapshot?: string | PlanSnapshot | null;
};
export type JobRow = RowDataPacket & {
  acknowledged_at?: string | Date | null;
  status?: 'WAITING' | 'DELIVERING' | 'COMPLETED' | 'ASSIGNED' | 'DELIVERED' | 'CANCELLED';
  delivery_job_id: number;
  route_plan_id: number;
  rider_id: number | null;
  job_code: string;
  total_orders: number;
  total_boxes: number;
  total_distance_km: number | null;
  estimated_duration_min: number | null;
  estimated_start_time: string | null;
  estimated_finish_time: string | null;
  delivery_cost: number | null;
  route_geometry: string | object | null;
};

export type StopRow = RowDataPacket & {
  delivery_job_id: number;
  order_id: number;
  stop_sequence: number;
  distance_from_previous_km: number | null;
  travel_time_from_previous_min: number | null;
  estimated_arrival_time: string | null;
  customer_id: number;
  box_count: number;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_latitude: number;
  customer_longitude: number;
  delivery_status: 'WAITING' | 'DELIVERING' | 'DELIVERED';
  leg_geometry: string | object | null;
};

/**
 * Pure summary mapping (DB-free, unit-tested): real persisted metrics, no
 * fake zeros. totalBoxes is passed in — derived from delivery_jobs, since
 * route_plans has no total_boxes column by design (normalized schema).
 */
export function toPlanSummary(
  row: PlanRow,
  totalBoxes: number,
  snapshot: PlanSnapshot | null = readSnapshot(row.input_snapshot),
): RoutePlanSummaryResponse {
  return {
    startTime: hhmm(row.start_time),
    deliveryDeadline: snapshot?.window?.deadline ?? snapshot?.shop.deliveryDeadline.slice(0, 5),
    routePlanId: row.route_plan_id,
    planDate: toISODate(row.plan_date),
    status: row.status,
    routingSource: (row.routing_source as RoutePlanSummaryResponse['routingSource']) ?? 'ROAD',
    approximate: Boolean(row.approximate),
    riderCount: row.rider_count ?? 0,
    totalDistanceKm: Number(row.total_distance_km ?? 0),
    estimatedFinishTime: hhmm(row.estimated_finish_time),
    totalBoxes,
    totalRevenue: Number(row.total_revenue ?? 0),
    totalFoodCost: Number(row.total_food_cost ?? 0),
    totalDeliveryCost: Number(row.total_delivery_cost ?? 0),
    estimatedProfit: Number(row.estimated_profit ?? 0),
  };
}

/** Pure job mapping (DB-free, unit-tested): stops, customer data, geometry. */
export function toJobResponse(
  job: JobRow,
  stops: StopRow[],
  riderIndex: number,
  approximate: boolean,
  snapshot: PlanSnapshot | null = null,
): DeliveryRouteResponse {
  return {
    acknowledgedAt:
      job.acknowledged_at instanceof Date
        ? job.acknowledged_at.toISOString()
        : (job.acknowledged_at ?? null),
    status:
      job.status === 'ASSIGNED'
        ? 'WAITING'
        : job.status === 'DELIVERED'
          ? 'COMPLETED'
          : (job.status ?? 'WAITING'),
    jobId: job.delivery_job_id,
    jobCode: job.job_code,
    riderIndex,
    riderId: job.rider_id,
    totalOrders: job.total_orders,
    totalBoxes: job.total_boxes,
    distanceKm: Number(job.total_distance_km ?? 0),
    durationMinutes: Number(job.estimated_duration_min ?? 0),
    estimatedStartTime: hhmm(job.estimated_start_time),
    estimatedFinishTime: hhmm(job.estimated_finish_time),
    deliveryCost: Number(job.delivery_cost ?? 0),
    geometry: parseGeometry(job.route_geometry),
    approximate,
    stops: stops.map((s): RouteStopResponse => ({
      sequence: s.stop_sequence,
      orderId: s.order_id,
      customerId: s.customer_id,
      customerName: s.customer_name,
      phone: s.customer_phone ?? '',
      address: s.customer_address,
      latitude: Number(s.customer_latitude),
      longitude: Number(s.customer_longitude),
      boxCount: s.box_count,
      distanceFromPreviousKm: Number(s.distance_from_previous_km ?? 0),
      travelTimeFromPreviousMin: Number(s.travel_time_from_previous_min ?? 0),
      estimatedArrivalTime: hhmm(s.estimated_arrival_time),
      deliveryStatus: s.delivery_status,
      geometry: parseGeometry(s.leg_geometry),
      ...snapshot?.stops.find((stop) => stop.orderId === s.order_id),
    })),
  };
}

/** TIME/"HH:MM" column → "HH:MM" (empty when unknown). */
function hhmm(value: string | null): string {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function parseGeometry(value: JobRow['route_geometry']): GeoJsonLineString | null {
  if (!value) return null;
  try {
    const parsed = (typeof value === 'string' ? JSON.parse(value) : value) as GeoJsonLineString;
    if (parsed?.type === 'LineString' && Array.isArray(parsed.coordinates)) return parsed;
    return null;
  } catch {
    return null;
  }
}
