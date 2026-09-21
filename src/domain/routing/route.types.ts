/**
 * Shared route-planning types for the Domain layer.
 *
 * Kept generic so the future routing algorithm can evolve
 * without changing controller/service signatures.
 */

/** A geographic point used for distance calculation. */
export interface RoutePoint {
  lat: number;
  lng: number;
}

/** Minimal order input the planner needs. */
export interface PlanningOrder {
  id: string;
  customerId: string;
  boxes: number;
  lat: number;
  lng: number;
}

/** Minimal rider input the planner needs. */
export interface PlanningRider {
  id: string;
}

/** One ordered delivery stop within a rider's route. */
export interface RouteStop {
  orderId: string;
  customerId: string;
  sequence: number;
  distanceFromPreviousKm: number;
}

/** Assignment of an ordered stop list to a single rider. */
export interface RiderAssignment {
  riderId: string;
  stops: RouteStop[];
  totalBoxes: number;
  distanceKm: number;
}

/** A full plan covering all pending orders. */
export interface PlannedRoute {
  assignments: RiderAssignment[];
  totalDistanceKm: number;
  unassignedOrderIds: string[];
}
