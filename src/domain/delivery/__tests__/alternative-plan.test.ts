import { describe, expect, it } from 'vitest';
import { findAlternativeRoutes, routeSignature } from '../alternative-plan';

const input = {
  orders: [1, 2, 3, 4].map(id => ({ id: String(id), coordinate: { latitude: 16 + id / 1000, longitude: 103 } })),
  boxes: new Map(['1', '2', '3', '4'].map(id => [id, 1])), shop: { latitude: 16, longitude: 103 },
  matrix: { pointIds: ['SHOP', '1', '2', '3', '4'], distancesKm: [[0,1,1,1,1],[1,0,1,9,9],[1,1,0,9,9],[1,9,9,0,1],[1,9,9,1,0]],
    durationsMinutes: [[0,1,1,1,1],[1,0,1,9,9],[1,1,0,9,9],[1,9,9,0,1],[1,9,9,1,0]], source: 'ROAD' as const, approximate: false },
  maxOrders: 2, riderCount: 2, availableMinutes: 60, serviceMinutes: 2,
  costs: { boxSalePrice: 65, boxFoodCost: 40, riderBaseCost: 15, riderCostPerKm: 2 },
  excluded: routeSignature([['1', '3'], ['2', '4']]),
};
describe('alternative route search', () => {
  it('finds a distinct cheaper plan, preserves every order and respects capacity', () => {
    const routes = findAlternativeRoutes(input);
    expect(routeSignature(routes.map(route => route.orderIds))).not.toBe(input.excluded);
    expect(routes.flatMap(route => route.orderIds).sort()).toEqual(['1', '2', '3', '4']);
    expect(routes.every(route => route.orderIds.length <= 2)).toBe(true);
    expect(routes.reduce((sum, route) => sum + route.totalDistanceKm, 0)).toBe(4);
    expect(routeSignature([['1','2'],['3','4']])).toBe(routeSignature([['3','4'],['1','2']]));
  });
  it('rejects impossible service time and the only existing single-stop route', () => {
    expect(() => findAlternativeRoutes({ ...input, availableMinutes: 3 })).toThrow(/No distinct/);
    expect(() => findAlternativeRoutes({ ...input, orders: input.orders.slice(0,1), riderCount: 1, excluded: routeSignature([['1']]) })).toThrow(/No distinct/);
  });
  it('can change the visit order when only one rider is available', () => {
    const routes=findAlternativeRoutes({...input,orders:input.orders.slice(0,2),riderCount:1,excluded:routeSignature([['1','2']])});
    expect(routes.map(route=>route.orderIds)).toEqual([['2','1']]);
  });
});
