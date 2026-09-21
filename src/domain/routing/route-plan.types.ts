import type {
  DistanceSource,
  FallbackReason,
  GeoJsonLineString,
} from './distance.types';

/**
 * RoutePlan response contract (backend source of truth — Angular renders
 * these values as-is and never recomputes routing, costing, or timing).
 * JSON is camelCase throughout.
 */
export type RoutePlanStatus = 'GENERATED' | 'SELECTED' | 'REJECTED';

export interface RouteStopResponse {
  sequence: number;
  orderId: number;
  customerId: number;
  customerName: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  boxCount: number;
  distanceFromPreviousKm: number;
  travelTimeFromPreviousMin: number;
  estimatedArrivalTime: string;
}

export interface DeliveryRouteResponse {
  jobId?: number;
  jobCode?: string;
  riderIndex: number;
  riderId: number | null;
  totalOrders: number;
  totalBoxes: number;
  distanceKm: number;
  durationMinutes: number;
  estimatedStartTime: string;
  estimatedFinishTime: string;
  deliveryCost: number;
  /** GeoJSON LineString (`[lng, lat]`) or null when routing fell back. */
  geometry: GeoJsonLineString | null;
  approximate: boolean;
  stops: RouteStopResponse[];
}

export interface RoutePlanResponse {
  routePlanId?: number;
  planDate: string;
  status: RoutePlanStatus;
  routingSource: DistanceSource;
  approximate: boolean;
  fallbackReason?: FallbackReason;
  riderCount: number;
  totalDistanceKm: number;
  estimatedFinishTime: string;
  totalBoxes: number;
  totalRevenue: number;
  totalFoodCost: number;
  totalDeliveryCost: number;
  estimatedProfit: number;
  jobs: DeliveryRouteResponse[];
}

/**
 * List/summary contract (`GET /api/route-plans`): the same metrics as the
 * detail response but WITHOUT `jobs`. An empty `jobs: []` must never be
 * returned here — it would falsely imply the plan has no jobs. Fetch
 * `GET /api/route-plans/:id` for stops and geometry.
 */
export type RoutePlanSummaryResponse = Omit<RoutePlanResponse, 'jobs'>;

/** Full-detail contract (`GET /api/route-plans/:id`): summary + hydrated jobs. */
export type RoutePlanDetailResponse = RoutePlanResponse;
