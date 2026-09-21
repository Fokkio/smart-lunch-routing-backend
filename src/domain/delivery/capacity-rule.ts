/** Capacity is orders, never boxes. Each order independently has 1–3 boxes. */
export const MAX_ORDERS_PER_RIDER = 3;
export class CapacityRule { static canAddOrder(currentOrders: number, limit = MAX_ORDERS_PER_RIDER): boolean { return currentOrders + 1 <= limit; } }