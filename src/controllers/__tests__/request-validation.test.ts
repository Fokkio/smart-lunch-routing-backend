import { describe, expect, it } from 'vitest';
import { parseNearbyQuery, parseSimulationRequest } from '../request-validation';

describe('request validation', () => {
  it('uses the endpoint default radius', () => {
    expect(parseNearbyQuery('16.24', '103.25', undefined, 1)).toEqual({
      lat: 16.24,
      lng: 103.25,
      radiusKm: 1,
    });
  });

  it('rejects invalid coordinates', () => {
    expect(() => parseNearbyQuery('91', '103.25', undefined, 1)).toThrow('lat must be between');
  });

  it('fixes customer search at 1km and order search at 2km', () => {
    expect(parseNearbyQuery('16','103',undefined,2).radiusKm).toBe(2);
    for (const radius of [1,2]) {
      expect(parseNearbyQuery('16','103',String(radius),radius).radiusKm).toBe(radius);
      for(const changed of ['0.5','3','50']) expect(()=>parseNearbyQuery('16','103',changed,radius)).toThrow(`radiusKm must be ${radius}`);
    }
  });

  it('rejects missing, blank and repeated coordinate/radius query values', () => {
    for (const lat of [undefined, null, '', ' ', ['16', '17'], 'NaN', 'Infinity']) {
      expect(() => parseNearbyQuery(lat, '103', undefined, 1)).toThrow();
    }
    for (const radius of ['', ' ', ['1', '2'], '0', '-1', 'Infinity']) {
      expect(() => parseNearbyQuery('16', '103', radius, 1)).toThrow();
    }
    expect(() => parseNearbyQuery('16', '', undefined, 2)).toThrow();
  });

  it('defaults simulation to 25 orders', () => {
    expect(parseSimulationRequest(undefined, undefined)).toEqual({ count: 25, orderDate: undefined });
  });

  it('only accepts 20 to 30 simulated orders', () => {
    expect(() => parseSimulationRequest(19, undefined)).toThrow('between 20 and 30');
    expect(() => parseSimulationRequest(31, undefined)).toThrow('between 20 and 30');
  });
});
